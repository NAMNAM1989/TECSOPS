import { alreadyAttempted, attemptSignature, consecutiveFailures, detectOscillation } from "./antiLoop";
import { applyHypothesis, diagnose, observationsFromCases } from "./diagnoser";
import { StructuredLogger } from "./logger";
import { bugReportFromMonitorEvent } from "./monitor";
import { detectProtectedOperations, isWriteAllowedPath } from "./permissions";
import { runNpmCheck } from "./verifier";
import { emptyVerification, findSimilarBugs } from "./persistence";
import { assertTransition } from "./phases";
import { hasPlaywrightHost, playwrightRequestFromReport, summarizePlaywrightEvidence } from "./playwright";
import { prependComment, valuesEqual } from "./sourceExec";
import { BUG_FIX_AGENT_SYSTEM_PROMPT } from "./systemPrompt";
import type {
  AgentConfig,
  AgentHost,
  AgentPhase,
  AgentStatus,
  BehaviorCase,
  BugFixAgentOptions,
  BugFixOutput,
  BugRecord,
  BugReport,
  CheckResult,
  Confidence,
  DebugSession,
  ErrorMonitorEvent,
  FileEdit,
  FixPlan,
  Hypothesis,
  Observation,
  Risk,
  VerificationResults,
} from "./types";

const DEFAULT_CONFIG: AgentConfig = {
  maxFailedImplementations: 2,
  autoImplementMinConfidence: "HIGH",
  autoCommit: false,
  allowProtectedOps: false,
};

const CONFIDENCE_RANK: Record<Confidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export { BUG_FIX_AGENT_SYSTEM_PROMPT };

export class BugFixAgent {
  private readonly host: AgentHost;
  private readonly store: BugFixAgentOptions["store"];
  private readonly config: AgentConfig;
  private readonly hooks: BugFixAgentOptions["hooks"];
  private readonly log: StructuredLogger;
  private session: DebugSession | null = null;

  constructor(options: BugFixAgentOptions) {
    this.host = options.host;
    this.store = options.store;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.hooks = options.hooks;
    this.log = new StructuredLogger(() => this.host.now());
    this.session = options.session ?? null;
  }

  async run(input: BugReport | string | ErrorMonitorEvent): Promise<BugFixOutput> {
    const report = normalizeInput(input);
    const existing = report.bug_id ? await this.store.loadByBugId(report.bug_id) : null;
    this.session = existing ?? this.createSession(report);
    this.log.events.push(...this.session.events);
    this.log.emit("BUG_RECEIVED", report.description, { bug_id: this.session.bug_id, module: report.module });
    await this.setPhase("RECEIVED", "IN_PROGRESS");

    const blocked = await this.guardProtected(report);
    if (blocked) return this.session.output;

    await this.collectContext();
    if (this.isStopped()) return this.session.output;

    await this.reproduce();
    if (this.isStopped()) return this.session.output;

    await this.diagnoseAndPlan();
    if (this.isStopped()) return this.session.output;

    await this.implementAndVerify();
    return this.session.output;
  }

  async resume(sessionId: string): Promise<BugFixOutput> {
    const loaded = await this.store.load(sessionId);
    if (!loaded) {
      throw new Error(`Debug session not found: ${sessionId}`);
    }
    this.session = loaded;
    this.log.events.push(...loaded.events);
    if (loaded.phase === "RESOLVED" || loaded.phase === "FAILED" || loaded.phase === "BLOCKED") {
      return loaded.output;
    }
    return this.run(loaded.report);
  }

  getSession(): DebugSession | null {
    return this.session;
  }

  private createSession(report: BugReport): DebugSession {
    const bugId = report.bug_id || this.host.randomId("bug");
    const sessionId = this.host.randomId("sess");
    const now = this.host.now();
    const record = emptyRecord(bugId, now, report);
    const output = emptyOutput(bugId);
    return {
      session_id: sessionId,
      bug_id: bugId,
      phase: "RECEIVED",
      status: "IN_PROGRESS",
      created_at: now,
      updated_at: now,
      report,
      events: [],
      attempts: [],
      hypotheses: [],
      observations: [],
      dirty_at_start: [],
      files_owned: [...(report.files ?? [])],
      record,
      output,
      reproduction_not_confirmed: false,
    };
  }

  private async guardProtected(report: BugReport): Promise<boolean> {
    const text = [
      report.description,
      ...(report.requested_operations ?? []),
      ...(report.reproduction_steps ?? []),
    ].join("\n");
    const reasons = detectProtectedOperations(text);
    if (reasons.length === 0 || this.config.allowProtectedOps) return false;
    this.log.emit("BUG_BLOCKED", `Protected operation requires approval: ${reasons.join("; ")}`, {
      reasons,
    });
    await this.setPhase("NEEDS_APPROVAL", "NEEDS_APPROVAL", {
      remaining_risks: reasons,
      requires_approval: true,
    });
    return true;
  }

  private async collectContext(): Promise<void> {
    await this.setPhase("COLLECTING_CONTEXT", "IN_PROGRESS");
    const git = await this.host.git.status();
    this.session!.dirty_at_start = git.entries.map((entry) => entry.path);
    const files = this.session!.report.files ?? [];
    const evidence: string[] = [];
    if (!git.clean) {
      evidence.push(`dirty working tree: ${this.session!.dirty_at_start.join(", ")}`);
    }
    for (const file of files) {
      if (await this.host.fs.exists(file)) {
        evidence.push(`read ${file}`);
      }
    }
    const history = (await this.store.list()).map((item) => item.record);
    const similar = findSimilarBugs(this.session!.record, history);
    if (similar.length) {
      evidence.push(`similar past bugs (hints only, not auto-applied): ${similar.map((item) => item.bug_id).join(", ")}`);
    }
    this.session!.record.evidence = unique([...(this.session!.record.evidence ?? []), ...evidence]);
    this.log.emit("CONTEXT_COLLECTED", evidence.join("; ") || "context collected", {
      dirty: this.session!.dirty_at_start,
    });
    await this.persist();
  }

  private async reproduce(): Promise<void> {
    await this.setPhase("REPRODUCING", "IN_PROGRESS");
    this.log.emit("REPRODUCTION_STARTED", "Attempting reproduction", {
      category: this.session!.report.category,
    });
    const report = this.session!.report;
    const steps = report.reproduction_steps ?? report.ui_workflow ?? ["execute reported cases"];
    let confirmed = false;

    if (report.category === "ui" && hasPlaywrightHost(this.host)) {
      const req = playwrightRequestFromReport({
        baseUrl: report.base_url,
        workflow: report.ui_workflow,
      });
      const evidence = await this.host.playwright.reproduce(req);
      const lines = summarizePlaywrightEvidence(evidence);
      this.session!.record.evidence = unique([...this.session!.record.evidence, ...lines]);
      confirmed = !evidence.ok;
    } else if (report.cases?.length) {
      const observations = await this.observe(report.cases);
      this.session!.observations = observations;
      confirmed = observations.some((item) => !item.passed);
    } else if (report.expected && report.actual && report.expected !== report.actual) {
      confirmed = true;
    }

    this.session!.record.reproduction = {
      confirmed,
      steps,
      status: confirmed ? "CONFIRMED" : "REPRODUCTION_NOT_CONFIRMED",
    };
    this.session!.reproduction_not_confirmed = !confirmed;
    this.session!.output.reproduction = { confirmed, steps };
    if (confirmed) {
      this.log.emit("REPRODUCTION_CONFIRMED", "Reproduction confirmed", { steps });
    } else {
      this.session!.status = "REPRODUCTION_NOT_CONFIRMED";
    }
    await this.persist();
  }

  private async diagnoseAndPlan(): Promise<void> {
    await this.setPhase("DIAGNOSING", "IN_PROGRESS");
    const files = await this.readKnownFiles();
    const rejected = this.session!.attempts.map((attempt) => attempt.strategy.replace(/^replace-return:\s*/, ""));
    const hypotheses = diagnose({
      description: this.session!.report.description,
      files,
      observations: this.session!.observations,
      rejectedExprs: rejected,
    });
    this.session!.hypotheses = hypotheses;
    for (const hypothesis of hypotheses) {
      this.log.emit("HYPOTHESIS_CREATED", hypothesis.summary, {
        confidence: hypothesis.confidence,
        id: hypothesis.id,
      });
    }

    const best = hypotheses[0];
    const proven = Boolean(best && best.confidence !== "LOW" && !this.session!.reproduction_not_confirmed);
    if (this.session!.reproduction_not_confirmed) {
      this.session!.record.root_cause = {
        summary: best?.summary || "Reproduction not confirmed; root cause not proven",
        evidence: best?.evidence ?? ["REPRODUCTION_NOT_CONFIRMED"],
        confidence: best?.confidence ?? "LOW",
        proven: false,
      };
    } else if (best) {
      this.session!.record.root_cause = {
        summary: best.summary,
        evidence: best.evidence,
        confidence: best.confidence,
        proven,
      };
    } else {
      await this.setPhase("NEEDS_REVIEW", "NEEDS_REVIEW", {
        remaining_risks: ["No evidence-backed hypothesis"],
      });
      return;
    }

    await this.setPhase("ROOT_CAUSE_IDENTIFIED", "IN_PROGRESS");
    this.log.emit("ROOT_CAUSE_IDENTIFIED", this.session!.record.root_cause.summary, {
      confidence: this.session!.record.root_cause.confidence,
      proven,
    });

    await this.setPhase("IMPACT_ANALYSIS", "IN_PROGRESS");
    const modules = unique([
      this.session!.report.module || "",
      ...(this.session!.report.files ?? []),
      ...hypotheses.map((item) => item.targetFile || ""),
    ].filter(Boolean));
    const risk = impactRisk(best?.confidence ?? "LOW", this.session!.report);
    this.session!.output.impact = { modules, risk };
    this.session!.record.module = modules[0] || this.session!.report.module || "unknown";

    await this.setPhase("FIX_PLANNING", "IN_PROGRESS");
    const plan = this.buildPlan(files, hypotheses, risk);
    if (!plan) {
      await this.setPhase("NEEDS_REVIEW", "NEEDS_REVIEW", {
        remaining_risks: ["No safe fix plan from current evidence"],
      });
      return;
    }
    const planText = [plan.strategy, ...this.session!.report.requested_operations ?? []].join("\n");
    const protectedHits = detectProtectedOperations(planText);
    if (protectedHits.length) {
      await this.setPhase("NEEDS_APPROVAL", "NEEDS_APPROVAL", {
        remaining_risks: protectedHits,
        requires_approval: true,
      });
      return;
    }
    if (!this.shouldAutoImplement(plan, risk)) {
      this.session!.output.fix = { strategy: plan.strategy, files_changed: plan.files.map((file) => file.path) };
      await this.setPhase("NEEDS_REVIEW", "NEEDS_REVIEW", {
        remaining_risks: [`Confidence ${plan.confidence} with risk ${risk} requires review`],
      });
      return;
    }
    this.session!.output.fix = { strategy: plan.strategy, files_changed: plan.files.map((file) => file.path) };
    this.log.emit("FIX_PLAN_CREATED", plan.strategy, {
      files: plan.files.map((file) => file.path),
      confidence: plan.confidence,
    });
    this.session!.record.fix = plan.strategy;
    await this.persist();
    this.pendingPlan = plan;
  }

  private pendingPlan: FixPlan | null = null;

  private buildPlan(files: Record<string, string>, hypotheses: Hypothesis[], risk: Risk): FixPlan | null {
    if (this.hooks?.planFix) {
      return this.hooks.planFix({
        report: this.session!.report,
        hypotheses,
        observations: this.session!.observations,
        files,
        attempts: this.session!.attempts,
      });
    }
    for (const hypothesis of hypotheses) {
      if (!hypothesis.targetFile) continue;
      const source = files[hypothesis.targetFile];
      if (source === undefined) continue;
      const next = applyHypothesis(source, hypothesis);
      if (!next || next === source) continue;
      const edit: FileEdit = {
        path: hypothesis.targetFile,
        content: next,
        reason: hypothesis.summary,
      };
      const signature = attemptSignature(`replace:${hypothesis.suggestedExpr || hypothesis.replaceTo || hypothesis.id}`, [edit]);
      if (alreadyAttempted(this.session!.attempts, signature)) continue;
      return {
        strategy: hypothesis.suggestedExpr
          ? `replace-return: ${hypothesis.suggestedExpr}`
          : hypothesis.summary,
        files: [edit],
        confidence: hypothesis.confidence,
        risk,
        verification: "targeted behavior cases + static checks",
      };
    }
    return null;
  }

  private shouldAutoImplement(plan: FixPlan, risk: Risk): boolean {
    if (plan.confidence === "LOW" && (risk === "HIGH" || risk === "MEDIUM")) return false;
    return CONFIDENCE_RANK[plan.confidence] >= CONFIDENCE_RANK[this.config.autoImplementMinConfidence]
      || (plan.confidence === "MEDIUM" && risk === "LOW");
  }

  private async implementAndVerify(): Promise<void> {
    if (!this.pendingPlan || this.isStopped()) return;
    let plan: FixPlan | null = this.pendingPlan;
    while (plan && !this.isStopped()) {
      const upcomingSig = attemptSignature(plan.strategy, plan.files);
      if (alreadyAttempted(this.session!.attempts, upcomingSig)) {
        await this.setPhase("FAILED", "FAILED", {
          remaining_risks: ["Repeated the same failed fix — stopped instead of looping"],
        });
        return;
      }
      if (detectOscillation(this.session!.attempts) || consecutiveFailures(this.session!.attempts) >= this.config.maxFailedImplementations) {
        this.log.emit("BUG_BLOCKED", "Anti-loop: stop modifying code and re-evaluate", {
          attempts: this.session!.attempts.length,
        });
        await this.setPhase("FAILED", "FAILED", {
          remaining_risks: ["Consecutive failed fixes — stopped to avoid speculative thrashing"],
        });
        return;
      }

      await this.setPhase("IMPLEMENTING", "IN_PROGRESS");
      const applied = await this.applyPlan(plan);
      if (applied.blocked) {
        await this.setPhase(applied.phase ?? "NEEDS_REVIEW", applied.status ?? "NEEDS_REVIEW", {
          remaining_risks: applied.risks,
          requires_approval: applied.phase === "NEEDS_APPROVAL",
        });
        return;
      }

      const verification = await this.verifyAll();
      const targetedPass = verification.targeted === "PASS" || (verification.targeted === "SKIP" && verification.e2e === "PASS");
      const staticOk = isOk(verification.typecheck) && isOk(verification.lint);
      const runtimeOk = isOk(verification.runtime);
      const regressionOk = !verificationFailed(this.session!.output.regression.result) &&
        (this.session!.output.regression.checked || !this.session!.report.regression_cases?.length);

      const attemptSig = attemptSignature(plan.strategy, plan.files);
      const passed = Boolean(targetedPass && staticOk && runtimeOk && regressionOk);
      this.session!.attempts.push({
        index: this.session!.attempts.length + 1,
        signature: attemptSig,
        strategy: plan.strategy,
        files: plan.files.map((file) => file.path),
        passed,
        evidence: [
          `targeted=${verification.targeted}`,
          `typecheck=${verification.typecheck}`,
          `runtime=${verification.runtime}`,
        ],
      });

      if (passed && this.session!.record.root_cause.summary && (this.session!.record.reproduction.confirmed || this.session!.record.root_cause.proven)) {
        this.log.emit("BUG_RESOLVED", "Verification passed; marking RESOLVED", {
          files: this.session!.output.fix.files_changed,
        });
        await this.setPhase("RESOLVED", "RESOLVED");
        return;
      }

      this.log.emit("TEST_FAILED", "Fix did not satisfy definition of done", {
        targeted: verification.targeted,
        typecheck: verification.typecheck,
      });

      if (consecutiveFailures(this.session!.attempts) >= this.config.maxFailedImplementations || detectOscillation(this.session!.attempts)) {
        await this.setPhase("FAILED", "FAILED", {
          remaining_risks: ["Behavior still wrong after failed fix attempts; not marking RESOLVED"],
        });
        return;
      }

      await this.setPhase("DIAGNOSING", "IN_PROGRESS");
      this.pendingPlan = null;
      await this.diagnoseAndPlan();
      plan = this.pendingPlan;
      if (!plan && !this.isStopped()) {
        await this.setPhase("FAILED", "FAILED", {
          remaining_risks: ["No further evidence-backed plan after failed fix"],
        });
        return;
      }
    }
  }

  private async applyPlan(plan: FixPlan): Promise<{
    blocked: boolean;
    phase?: AgentPhase;
    status?: AgentStatus;
    risks?: string[];
  }> {
    const dirty = new Set(this.session!.dirty_at_start);
    const owned = new Set(this.session!.files_owned);
    const changed: string[] = [];
    for (const edit of plan.files) {
      if (!isWriteAllowedPath(edit.path)) {
        return { blocked: true, phase: "NEEDS_APPROVAL", status: "NEEDS_APPROVAL", risks: [`Protected path ${edit.path}`] };
      }
      if (dirty.has(edit.path) && !owned.has(edit.path)) {
        continue;
      }
      await this.host.fs.writeFile(edit.path, edit.content);
      changed.push(edit.path);
      if (!owned.has(edit.path)) owned.add(edit.path);
    }
    this.session!.files_owned = [...owned];
    this.session!.output.fix = { strategy: plan.strategy, files_changed: unique([...this.session!.output.fix.files_changed, ...changed]) };
    this.session!.record.files_changed = this.session!.output.fix.files_changed;
    if (changed.length === 0) {
      return {
        blocked: true,
        phase: "NEEDS_REVIEW",
        status: "NEEDS_REVIEW",
        risks: ["Refused to overwrite unrelated uncommitted user changes"],
      };
    }
    this.log.emit("CODE_MODIFIED", `Updated ${changed.join(", ")}`, { files: changed });
    if (this.config.autoCommit) {
      return { blocked: true, phase: "NEEDS_APPROVAL", status: "NEEDS_APPROVAL", risks: ["Auto-commit is not default; requires explicit configuration"] };
    }
    return { blocked: false };
  }

  private async verifyAll(): Promise<VerificationResults> {
    await this.setPhase("STATIC_CHECK", "IN_PROGRESS");
    const verification = emptyVerification();
    verification.typecheck = await runNpmCheck(this.host.exec, "npm:typecheck");
    verification.lint = await runNpmCheck(this.host.exec, "npm:lint");
    this.session!.record.verification.typecheck = verification.typecheck;
    this.session!.record.verification.lint = verification.lint;

    await this.setPhase("TESTING", "IN_PROGRESS");
    this.log.emit("TEST_STARTED", "Targeted verification", {});
    verification.targeted = await this.runTargeted();
    verification.unit_tests = verification.targeted;
    this.session!.record.verification.targeted = verification.targeted;
    this.session!.record.verification.unit_tests = verification.unit_tests;
    if (verification.targeted === "PASS") {
      this.log.emit("TEST_PASSED", "Targeted checks passed", {});
    }

    await this.setPhase("RUNTIME_VERIFYING", "IN_PROGRESS");
    if (this.session!.report.category === "ui" && hasPlaywrightHost(this.host)) {
      const evidence = await this.host.playwright.verify(
        playwrightRequestFromReport({
          baseUrl: this.session!.report.base_url,
          workflow: this.session!.report.ui_workflow,
        }),
      );
      verification.runtime = evidence.ok ? "PASS" : "FAIL";
      verification.e2e = verification.runtime;
      this.session!.record.evidence = unique([
        ...this.session!.record.evidence,
        ...summarizePlaywrightEvidence(evidence),
      ]);
    } else {
      verification.runtime = verification.targeted === "FAIL" ? "FAIL" : "SKIP";
      verification.e2e = "SKIP";
    }

    await this.setPhase("REGRESSION_CHECK", "IN_PROGRESS");
    const regression = await this.runRegression();
    this.session!.output.regression = regression;
    this.session!.record.regression = regression;
    this.log.emit("REGRESSION_CHECK", regression.result, { checked: regression.checked });

    this.session!.record.verification = { ...this.session!.record.verification, ...verification };
    this.session!.output.verification = {
      typecheck: verification.typecheck,
      lint: verification.lint,
      unit_tests: verification.unit_tests,
      integration_tests: verification.integration_tests,
      e2e: verification.e2e,
      build: verification.build,
      runtime: verification.runtime,
    };
    await this.persist();
    return verification;
  }

  private async runTargeted(): Promise<CheckResult> {
    const report = this.session!.report;
    if (report.category === "ui" && hasPlaywrightHost(this.host)) {
      const evidence = await this.host.playwright.verify(
        playwrightRequestFromReport({
          baseUrl: report.base_url,
          workflow: report.ui_workflow,
        }),
      );
      return evidence.ok ? "PASS" : "FAIL";
    }
    const cases = [...(report.cases ?? []), ...(report.regression_cases ?? [])];
    if (!cases.length) return "SKIP";
    const observations = await this.observe(report.cases ?? []);
    this.session!.observations = observations;
    return observations.every((item) => item.passed) ? "PASS" : "FAIL";
  }

  private async runRegression(): Promise<{ checked: boolean; result: string }> {
    const extra = this.session!.report.regression_cases ?? [];
    if (!extra.length) {
      return { checked: true, result: "PASS (no additional regression cases)" };
    }
    const observations = await this.observe(extra);
    const failed = observations.filter((item) => !item.passed);
    if (failed.length) {
      this.session!.observations = uniqueObservations([...this.session!.observations, ...observations]);
      return { checked: true, result: `FAIL ${failed.map((item) => item.name).join(", ")}` };
    }
    return { checked: true, result: "PASS" };
  }

  private async observe(cases: BehaviorCase[]): Promise<Observation[]> {
    const files = await this.readKnownFiles();
    const run = (fnName: string, args: unknown[]) => {
      const file = Object.entries(files).find(([, source]) => source.includes(`function ${fnName}`));
      if (!file) throw new Error(`No source for ${fnName}`);
      if (!this.host.runBehavior) throw new Error("Host cannot execute behavior");
      return this.host.runBehavior(file[1], fnName, args);
    };
    return observationsFromCases(cases, run);
  }

  private async readKnownFiles(): Promise<Record<string, string>> {
    const paths = unique([
      ...(this.session!.report.files ?? []),
      ...this.session!.files_owned,
      ...(await this.host.fs.list()),
    ]);
    const files: Record<string, string> = {};
    for (const path of paths) {
      if (await this.host.fs.exists(path)) {
        files[path] = await this.host.fs.readFile(path);
      }
    }
    return files;
  }

  private isStopped(): boolean {
    if (!this.session) return true;
    return (
      this.session.phase === "BLOCKED" ||
      this.session.phase === "NEEDS_APPROVAL" ||
      this.session.phase === "FAILED" ||
      this.session.phase === "NEEDS_REVIEW" ||
      this.session.phase === "RESOLVED"
    );
  }

  private async setPhase(
    phase: AgentPhase,
    status: AgentStatus,
    extra?: Partial<Pick<BugFixOutput, "remaining_risks" | "requires_approval">>,
  ): Promise<void> {
    if (!this.session) throw new Error("No session");
    assertTransition(this.session.phase, phase);
    this.session.phase = phase;
    this.session.status = status;
    this.session.updated_at = this.host.now();
    this.session.record.status = status;
    this.session.record.timestamp = this.session.updated_at;
    this.session.output = {
      ...this.session.output,
      bug_id: this.session.bug_id,
      status,
      phase,
      reproduction: {
        confirmed: this.session.record.reproduction.confirmed,
        steps: this.session.record.reproduction.steps,
      },
      root_cause: {
        summary: this.session.record.root_cause.summary,
        evidence: this.session.record.root_cause.evidence,
        confidence: this.session.record.root_cause.confidence,
      },
      remaining_risks: extra?.remaining_risks ?? this.session.output.remaining_risks,
      requires_approval: extra?.requires_approval ?? this.session.output.requires_approval,
    };
    if (status === "RESOLVED") {
      this.session.output.remaining_risks = [];
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.session) return;
    this.session.events = [...this.log.events];
    await this.store.save(this.session);
  }
}

export function runBugFixAgent(input: BugReport | string | ErrorMonitorEvent, options: BugFixAgentOptions): Promise<BugFixOutput> {
  return new BugFixAgent(options).run(input);
}

function isMonitorEvent(input: BugReport | ErrorMonitorEvent): input is ErrorMonitorEvent {
  return "source" in input && input.source === "ERROR_MONITOR_AGENT";
}

export function normalizeInput(input: BugReport | string | ErrorMonitorEvent): BugReport {
  if (typeof input === "string") return { description: input, category: "code" };
  if (isMonitorEvent(input)) return bugReportFromMonitorEvent(input);
  return { category: input.category ?? "code", ...input };
}

function emptyRecord(bugId: string, now: string, report: BugReport): BugRecord {
  return {
    bug_id: bugId,
    timestamp: now,
    description: report.description,
    reproduction: { confirmed: false, steps: report.reproduction_steps ?? [], status: "NOT_ATTEMPTED" },
    evidence: [],
    module: report.module || "unknown",
    root_cause: { summary: "", evidence: [], confidence: "LOW", proven: false },
    confidence: "",
    files_changed: [],
    fix: "",
    tests: [],
    verification: emptyVerification(),
    regression: { checked: false, result: "" },
    status: "IN_PROGRESS",
  };
}

function emptyOutput(bugId: string): BugFixOutput {
  return {
    bug_id: bugId,
    status: "IN_PROGRESS",
    phase: "RECEIVED",
    reproduction: { confirmed: false, steps: [] },
    root_cause: { summary: "", evidence: [], confidence: "" },
    impact: { modules: [], risk: "" },
    fix: { strategy: "", files_changed: [] },
    verification: {
      typecheck: "",
      lint: "",
      unit_tests: "",
      integration_tests: "",
      e2e: "",
      build: "",
      runtime: "",
    },
    regression: { checked: false, result: "" },
    remaining_risks: [],
    requires_approval: false,
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function uniqueObservations(items: Observation[]): Observation[] {
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const item of items) {
    const key = `${item.name}:${item.functionName}:${JSON.stringify(item.input)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isOk(result: CheckResult): boolean {
  return result === "PASS" || result === "SKIP" || result === "NOT_RUN";
}

function verificationFailed(result: string): boolean {
  return result.startsWith("FAIL");
}

function impactRisk(confidence: Confidence, report: BugReport): Risk {
  if (report.category === "ops") return "HIGH";
  if ((report.files ?? []).some((file) => /auth|security|db|migrate/i.test(file))) return "HIGH";
  if (confidence === "LOW") return "MEDIUM";
  return "LOW";
}

/** Exported for tests that need a comment-only false fix. */
export function commentOnlyPlan(files: Record<string, string>, path: string): FixPlan {
  const source = files[path];
  if (source === undefined) {
    return { strategy: "noop", files: [], confidence: "HIGH", risk: "LOW", verification: "none" };
  }
  return {
    strategy: "comment-only false fix",
    files: [{ path, content: prependComment(source, "compiled ok"), reason: "false fix" }],
    confidence: "HIGH",
    risk: "LOW",
    verification: "typecheck only",
  };
}

export function valuesMatch(a: unknown, b: unknown): boolean {
  return valuesEqual(a, b);
}
