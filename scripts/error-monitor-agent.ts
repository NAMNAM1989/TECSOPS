/**
 * CLI ERROR_MONITOR_AGENT — host Node, core không import fs.
 * Chạy: npm run error-monitor -- --demo backend-500
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  ErrorMonitorAgent,
  createMemoryMonitorHost,
  type ErrorMonitorHost,
} from "../src/agents/errorMonitor/index";
import { createMemoryHost, createMemorySessionStore, runBugFixAgent } from "../src/agents/bugFix/index";
import type { BugFixOutput, BugReport, ErrorMonitorEvent } from "../src/agents/bugFix/types";

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

const DEMOS: Record<string, Record<string, unknown>> = {
  "backend-500": {
    source: "backend",
    service: "tecsops",
    module: "stateStore",
    error_type: "Error",
    message: "Internal Server Error while loading /api/state",
    stack_trace:
      "Error: Internal Server Error\n    at loadState (server/stateStore.mjs)\n    at app.get (server/index.mjs)",
    http: { method: "GET", status: 500, path: "/api/state" },
    user_flow: "ops_dashboard_load",
    environment: "cli",
  },
  "db-down": {
    source: "backend",
    module: "db",
    error_type: "DatabaseUnavailable",
    message: "connect ECONNREFUSED 127.0.0.1:5432 — Postgres unavailable",
    http: { method: "GET", status: 503, path: "/api/health" },
  },
};

function createPersistHost(root: string): ErrorMonitorHost {
  const memory = createMemoryMonitorHost();
  const base = path.join(root, ".tecsops/error-monitor-agent");
  return {
    now: () => new Date().toISOString(),
    randomId: (prefix = "em") => memory.randomId(prefix),
    async persist(kind, id, payload) {
      const dir = path.join(base, kind);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2), "utf8");
    },
  };
}

async function runFix(report: BugReport, event: ErrorMonitorEvent): Promise<BugFixOutput> {
  if (has("--no-bugfix")) {
    return {
      bug_id: report.bug_id || event.error_id,
      status: "IN_PROGRESS",
      phase: "RECEIVED",
      reproduction: { confirmed: false, steps: report.reproduction_steps || [] },
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
      remaining_risks: ["CLI demo skipped runBugFixAgent (--no-bugfix)"],
      requires_approval: false,
    };
  }
  return runBugFixAgent(report, {
    host: createMemoryHost(),
    store: createMemorySessionStore(),
    config: { autoCommit: false, allowProtectedOps: false },
  });
}

async function main() {
  const root = arg("--root") || process.cwd();
  const demoName = arg("--demo") || "backend-500";
  const eventFile = arg("--event-file");
  const host = createPersistHost(root);
  const agent = new ErrorMonitorAgent({
    host,
    environment: "cli",
    runBugFix: has("--dispatch") || !has("--no-bugfix") ? runFix : null,
  });
  let raw: Record<string, unknown>;
  if (eventFile) {
    raw = JSON.parse(await fs.readFile(path.resolve(root, eventFile), "utf8")) as Record<string, unknown>;
  } else {
    raw = DEMOS[demoName] || DEMOS["backend-500"];
  }
  const result = await agent.ingest(raw);
  const persistDir = path.join(root, ".tecsops/error-monitor-agent");
  if (!has("--no-persist") && result.bug_report) {
    await fs.mkdir(path.join(persistDir, "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(persistDir, "sessions", `${result.bug_report.bug_id}.json`),
      JSON.stringify({ result, snapshot: agent.snapshot() }, null, 2),
      "utf8",
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        fingerprint: result.fingerprint,
        classification: result.classification,
        severity: result.severity,
        dispatched: result.dispatched,
        bug_id: result.bug_report?.bug_id || null,
        error_id: result.monitor_event?.error_id || null,
        monitor_event: result.monitor_event,
        summary: result.bug_report?.summary || null,
      },
      null,
      2,
    ),
  );
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
