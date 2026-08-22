import { classifyEvent, classifySeverity, isHardClassification, shouldDispatchToBugFix } from "./classification";
import { buildInternalBugReport, dispatchToBugFix } from "./dispatcher";
import { fingerprintEvent } from "./fingerprint";
import { automationRawEvent, createHealthMonitor, trackAutomationRun } from "./health";
import { normalizeErrorEvent } from "./normalizer";
import { permissionModel } from "./permissions";
import { sanitizeRecord } from "./sanitizer";
import { createMemoryStore } from "./store";
import type { MonitorStore } from "./store";
import type {
  Classification,
  ErrorMonitorConfig,
  ErrorMonitorHost,
  ErrorMonitorOptions,
  IngestResult,
  InternalBugReport,
  MonitorIncident,
  NormalizedErrorEvent,
  ObsEventType,
} from "./types";
import { AGENT_NAME, DEFAULT_CONFIG } from "./types";

type ObsEntry = { type: ObsEventType; ts: string; [key: string]: unknown };

export class ErrorMonitorAgent {
  private readonly host: ErrorMonitorHost;
  private readonly config: ErrorMonitorConfig;
  private readonly store: MonitorStore;
  private readonly health: ReturnType<typeof createHealthMonitor>;
  private readonly events: ObsEntry[] = [];
  private readonly counts: Record<string, number> = {};
  private readonly windowHits: number[] = [];
  private llmCalls = 0;
  private llmSkipped = 0;
  private readonly options: ErrorMonitorOptions;

  constructor(options: ErrorMonitorOptions) {
    this.options = options;
    this.host = options.host;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.store = createMemoryStore();
    this.health = createHealthMonitor(this.host, {
      staleMs: this.config.workerStaleMs,
      maxRestarts: this.config.maxWorkerRestarts,
      restartFn: options.workerRestartFn,
      onEvent: (type, payload) => this.emit(type as ObsEventType, payload),
    });
  }

  get observability() {
    return {
      count: (type: string) => this.counts[type] || 0,
      snapshot: () => ({ total: this.events.length, counts: { ...this.counts } }),
    };
  }

  get llm() {
    return { callCount: this.llmCalls, skippedCount: this.llmSkipped };
  }

  get storeView() {
    return this.store;
  }

  get healthView() {
    return this.health;
  }

  snapshot() {
    return {
      agent: AGENT_NAME,
      permissions: permissionModel(),
      health: this.health.snapshot(),
      incidents: this.store.listIncidents().map(publicIncident),
      bugs: this.store.listBugs(),
      dispatched_count: this.store.dispatched.length,
      notifications: this.store.notifications.slice(-20),
      observability: this.observability.snapshot(),
      llm: { calls: this.llmCalls, skipped: this.llmSkipped },
    };
  }

  async ingest(raw: Record<string, unknown>): Promise<IngestResult> {
    try {
      this.windowHits.push(this.nowMs());
      const storm = this.stormState();
      const { sanitized, redacted_count } = sanitizeRecord(raw || {});
      if (redacted_count > 0) this.emit("SECRET_REDACTED", { count: redacted_count });
      const event = normalizeErrorEvent(sanitized, this.host, {
        environment: this.options.environment,
        release: this.options.release,
        git_commit: this.options.git_commit,
        service: this.config.service,
      });
      this.emit("ERROR_DETECTED", { event_id: event.event_id, source: event.source, module: event.module });
      const { fingerprint } = fingerprintEvent(event);
      this.emit("FINGERPRINT_CREATED", { event_id: event.event_id, fingerprint });

      let classified = classifyEvent(event);
      classified = await this.maybeLlm(event, classified);
      const sev = classifySeverity(event, classified);
      const { incident, isNew } = this.upsert(event, fingerprint, classified, sev.severity);
      this.correlate(incident, event);

      let regressionHit = false;
      if (!isNew) regressionHit = this.onRepeat(incident);

      if (storm.storm) {
        this.emit("STORM_AGGREGATED", {
          fingerprint,
          eventsInWindow: storm.eventsInWindow,
          occurrence_count: incident.occurrence_count,
        });
      }

      const evidence = {
        http: event.http,
        url: event.url,
        user_flow: event.user_flow,
        request_id: event.request_id,
        module: event.module,
        source: event.source,
        stack_present: Boolean(event.stack_trace),
        automation: event.automation,
        health: this.health.snapshot(),
      };
      const immediate = sev.severity === "SEV-0" || sev.severity === "SEV-1";

      if (!shouldDispatchToBugFix(classified) && isNew) {
        incident.status = "SUPPRESSED_VALIDATION";
        this.store.putIncident(incident);
        this.emit("BUG_DISPATCH_SKIPPED", { classification: classified.classification, reason: "non_dispatchable" });
      }

      let report = incident.bug_id ? this.store.getBug(incident.bug_id) : null;
      let dispatched = false;
      if (this.shouldCreateDispatch(incident, classified, regressionHit)) {
        const bugId = incident.bug_id || this.host.randomId("bug");
        report = buildInternalBugReport({
          incident,
          event,
          classified,
          severity: sev.severity,
          evidence,
          requiresImmediate: immediate,
          bugId,
        });
        incident.bug_id = report.bug_id;
        incident.dispatch_count += 1;
        if (incident.status !== "HUMAN_REVIEW_REQUIRED") incident.status = "DISPATCHED";
        this.store.putIncident(incident);
        this.store.putBug(report);
        this.store.dispatched.push({
          bug_id: report.bug_id,
          at: this.host.now(),
          classification: classified.classification,
        });
        const dispatchedOut = await dispatchToBugFix({
          report,
          runBugFix: this.options.runBugFix,
        });
        void this.host.persist?.("outbox", report.bug_id, {
          kind: "ERROR_MONITOR_EVENT",
          consumed_by: "BUG_FIX_AGENT",
          event: dispatchedOut.event,
          bug_report: dispatchedOut.mapped,
          monitor_report: report,
        });
        if (dispatchedOut.output) this.acceptFixResult({
          bug_id: report.bug_id,
          status: dispatchedOut.output.status,
          root_cause: dispatchedOut.output.root_cause.summary,
          remaining_risk: dispatchedOut.output.remaining_risks.join("; "),
        });
        this.emit("BUG_DISPATCHED", { bug_id: report.bug_id, fingerprint, severity: sev.severity });
        dispatched = true;
      } else if (report) {
        report.occurrence_count = incident.occurrence_count;
        report.last_seen = incident.last_seen;
        this.store.putBug(report);
      }

      if (immediate) this.notify(incident, event, "ESCALATED", isNew || regressionHit);
      else if (dispatched) this.notify(incident, event, "BUG_DISPATCHED", false);

      if (classified.classification === "INFRASTRUCTURE_ERROR") {
        this.health.recordDb({ ok: false, queryOk: false, detail: event.message });
      }

      return {
        ok: true,
        event,
        fingerprint,
        classification: classified.classification,
        subtype: classified.subtype,
        severity: sev.severity,
        incident,
        bug_report: report,
        dispatched,
        storm: storm.storm,
        redacted_count,
        monitor_event: report?.error_monitor_event,
      };
    } catch (err) {
      return { ok: false, isolated: true, error: String((err as Error)?.message || err) };
    }
  }

  async ingestAutomation(rawRun: Record<string, unknown>): Promise<IngestResult> {
    try {
      const run = trackAutomationRun(rawRun || {});
      return this.ingest(automationRawEvent(run, rawRun || {}));
    } catch (err) {
      return { ok: false, isolated: true, error: String((err as Error)?.message || err) };
    }
  }

  acceptFixResult(result: {
    bug_id?: string;
    status?: string;
    root_cause?: string;
    remaining_risk?: string;
  }) {
    const bugId = String(result?.bug_id || "");
    const bug = this.store.getBug(bugId);
    if (!bug) return { ok: false as const, reason: "unknown_bug" };
    const incoming = String(result.status || "").toUpperCase();
    bug.fix_result = {
      status: incoming,
      root_cause: result.root_cause || null,
      remaining_risk: result.remaining_risk || null,
      received_at: this.host.now(),
    };
    const incident = this.store.listIncidents().find((item) => item.bug_id === bugId);
    if (incoming === "RESOLVED") {
      bug.status = "FIXED_PENDING_OBSERVATION";
      if (incident) {
        incident.status = "FIXED_PENDING_OBSERVATION";
        incident.observation_started_at = this.host.now();
        this.store.putIncident(incident);
      }
      this.emit("POST_FIX_OBSERVATION_STARTED", { bug_id: bugId });
    } else if (incoming === "FAILED" || incoming === "REPEATED_FIX_FAILURE") {
      if (incident) {
        incident.fix_attempt_count += 1;
        this.store.putIncident(incident);
      }
    } else if (incoming === "IN_PROGRESS") {
      bug.status = "IN_PROGRESS";
      if (incident) {
        incident.status = "IN_PROGRESS";
        this.store.putIncident(incident);
      }
    }
    this.store.putBug(bug);
    this.emit("FIX_RESULT_ACCEPTED", { bug_id: bugId, incoming_status: incoming, stored_status: bug.status });
    return { ok: true as const, bug, incident: incident || null };
  }

  observePostFix(): MonitorIncident[] {
    const ts = this.nowMs();
    const resolved: MonitorIncident[] = [];
    for (const incident of this.store.listIncidents()) {
      if (incident.status !== "FIXED_PENDING_OBSERVATION") continue;
      const start = Date.parse(incident.observation_started_at || "");
      if (!Number.isFinite(start) || ts - start < this.config.observationWindowMs) continue;
      const last = Date.parse(incident.last_seen || "");
      if (Number.isFinite(last) && last > start) continue;
      incident.status = "RESOLVED";
      incident.resolved_at = this.host.now();
      this.store.putIncident(incident);
      const bug = incident.bug_id ? this.store.getBug(incident.bug_id) : null;
      if (bug) {
        bug.status = "RESOLVED";
        this.store.putBug(bug);
      }
      this.emit("INCIDENT_RESOLVED", { incident_id: incident.incident_id, bug_id: incident.bug_id });
      resolved.push(incident);
    }
    return resolved;
  }

  private emit(type: ObsEventType, payload: Record<string, unknown> = {}) {
    this.events.push({ type, ts: this.host.now(), ...payload });
    this.counts[type] = (this.counts[type] || 0) + 1;
    if (this.events.length > 2_000) this.events.splice(0, this.events.length - 2_000);
  }

  private nowMs(): number {
    const n = Date.parse(this.host.now());
    return Number.isFinite(n) ? n : 0;
  }

  private stormState() {
    const ts = this.nowMs();
    while (this.windowHits.length && ts - this.windowHits[0] > this.config.stormWindowMs) this.windowHits.shift();
    return { eventsInWindow: this.windowHits.length, storm: this.windowHits.length >= this.config.stormThreshold };
  }

  private async maybeLlm(event: NormalizedErrorEvent, rule: Classification): Promise<Classification> {
    if (!isHardClassification(rule)) return rule;
    const storm = this.stormState();
    if (!this.options.llmClassifyFn || storm.storm || this.llmCalls >= this.config.llmMaxCallsPerWindow) {
      this.llmSkipped += 1;
      this.emit(storm.storm ? "LLM_SKIPPED" : "LLM_SKIPPED", { reason: storm.storm ? "storm" : "no_or_limited_llm" });
      return rule;
    }
    this.llmCalls += 1;
    this.emit("LLM_CALLED", { purpose: "classify" });
    const extra = await this.options.llmClassifyFn({ event, rule });
    if (extra?.classification) {
      return {
        classification: extra.classification,
        subtype: extra.subtype ?? rule.subtype,
        confidence: extra.confidence ?? 0.6,
        reason: extra.reason || "llm",
        via: "llm",
      };
    }
    return rule;
  }

  private upsert(
    event: NormalizedErrorEvent,
    fingerprint: string,
    classified: Classification,
    severity: MonitorIncident["severity"],
  ) {
    const existing = this.store.getIncidentByFingerprint(fingerprint);
    const ts = event.timestamp;
    if (existing) {
      existing.occurrence_count += 1;
      existing.last_seen = ts;
      existing.last_event = event;
      existing.recent_events.push({ event_id: event.event_id, timestamp: ts, message: event.message, http: event.http });
      if (existing.recent_events.length > this.config.maxStoredEventsPerIncident) {
        existing.recent_events.splice(0, existing.recent_events.length - this.config.maxStoredEventsPerIncident);
      }
      this.store.putIncident(existing);
      this.emit("INCIDENT_UPDATED", { incident_id: existing.incident_id, occurrence_count: existing.occurrence_count });
      return { incident: existing, isNew: false };
    }
    const incident: MonitorIncident = {
      incident_id: this.host.randomId("inc"),
      fingerprint,
      status: "OPEN",
      classification: classified.classification,
      subtype: classified.subtype,
      severity,
      first_seen: ts,
      last_seen: ts,
      occurrence_count: 1,
      dispatch_count: 0,
      fix_attempt_count: 0,
      bug_id: null,
      correlated_ids: [],
      recent_events: [{ event_id: event.event_id, timestamp: ts, message: event.message, http: event.http }],
      first_event: event,
      last_event: event,
    };
    this.store.putIncident(incident);
    this.emit("INCIDENT_OPENED", { incident_id: incident.incident_id, fingerprint });
    return { incident, isNew: true };
  }

  private correlate(incident: MonitorIncident, event: NormalizedErrorEvent) {
    const keys = [
      event.request_id && `req:${event.request_id}`,
      event.trace_id && `tr:${event.trace_id}`,
      event.job_id && `job:${event.job_id}`,
      event.automation?.run_id && `run:${event.automation.run_id}`,
    ].filter(Boolean) as string[];
    if (!keys.length) return;
    const nowMs = this.nowMs();
    for (const other of this.store.listIncidents()) {
      if (other.incident_id === incident.incident_id) continue;
      const otherEvent = other.last_event || other.first_event;
      if (Math.abs(nowMs - Date.parse(other.last_seen || "")) > this.config.correlationWindowMs) continue;
      const otherKeys = [
        otherEvent.request_id && `req:${otherEvent.request_id}`,
        otherEvent.trace_id && `tr:${otherEvent.trace_id}`,
        otherEvent.job_id && `job:${otherEvent.job_id}`,
        otherEvent.automation?.run_id && `run:${otherEvent.automation.run_id}`,
      ].filter(Boolean) as string[];
      if (!keys.some((key) => otherKeys.includes(key))) continue;
      if (!incident.correlated_ids.includes(other.incident_id)) incident.correlated_ids.push(other.incident_id);
      if (!other.correlated_ids.includes(incident.incident_id)) {
        other.correlated_ids.push(incident.incident_id);
        this.store.putIncident(other);
      }
    }
    this.store.putIncident(incident);
  }

  private onRepeat(incident: MonitorIncident): boolean {
    if (incident.status !== "RESOLVED" && incident.status !== "FIXED_PENDING_OBSERVATION") return false;
    incident.status = "REGRESSION";
    incident.reopened_at = this.host.now();
    incident.fix_attempt_count += 1;
    this.emit("REGRESSION_DETECTED", {
      incident_id: incident.incident_id,
      fingerprint: incident.fingerprint,
      bug_id: incident.bug_id,
    });
    if (incident.fix_attempt_count >= this.config.maxFixAttempts) {
      incident.status = "HUMAN_REVIEW_REQUIRED";
      this.emit("REPEATED_FIX_FAILURE", { incident_id: incident.incident_id, attempts: incident.fix_attempt_count });
      this.emit("HUMAN_REVIEW_REQUIRED", { incident_id: incident.incident_id, reason: "REPEATED_FIX_FAILURE" });
    }
    this.store.putIncident(incident);
    return incident.status !== "HUMAN_REVIEW_REQUIRED";
  }

  private shouldCreateDispatch(incident: MonitorIncident, classified: Classification, regressionHit: boolean) {
    if (!shouldDispatchToBugFix(classified)) return false;
    if (incident.status === "HUMAN_REVIEW_REQUIRED" || incident.status === "SUPPRESSED_VALIDATION") return false;
    if (regressionHit) return true;
    if (incident.dispatch_count > 0) return false;
    return incident.status === "OPEN";
  }

  private notify(incident: MonitorIncident, event: NormalizedErrorEvent, kind: string, force: boolean) {
    const last = incident.last_notification_at ? Date.parse(incident.last_notification_at) : 0;
    const immediate = incident.severity === "SEV-0" || incident.severity === "SEV-1";
    const cooldown = immediate ? 60_000 : 15 * 60_000;
    if (!force && last && this.nowMs() - last < cooldown && kind !== "ESCALATED") return;
    this.store.notifications.push({
      at: this.host.now(),
      kind,
      severity: incident.severity,
      incident_id: incident.incident_id,
      bug_id: incident.bug_id,
      fingerprint: incident.fingerprint,
      message: event.message,
      immediate,
    });
    incident.last_notification_at = this.host.now();
    if (kind === "ESCALATED" || immediate) this.emit("ESCALATED", { incident_id: incident.incident_id, severity: incident.severity });
  }
}

export function createErrorMonitorAgent(options: ErrorMonitorOptions): ErrorMonitorAgent {
  return new ErrorMonitorAgent(options);
}

export async function runErrorMonitorAgent(
  raw: Record<string, unknown>,
  options: ErrorMonitorOptions,
): Promise<IngestResult> {
  return new ErrorMonitorAgent(options).ingest(raw);
}

function publicIncident(incident: MonitorIncident) {
  return {
    incident_id: incident.incident_id,
    fingerprint: incident.fingerprint,
    status: incident.status,
    classification: incident.classification,
    subtype: incident.subtype,
    severity: incident.severity,
    first_seen: incident.first_seen,
    last_seen: incident.last_seen,
    occurrence_count: incident.occurrence_count,
    dispatch_count: incident.dispatch_count,
    bug_id: incident.bug_id,
    correlated_ids: incident.correlated_ids,
  };
}

export type { InternalBugReport };
