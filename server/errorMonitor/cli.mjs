#!/usr/bin/env node
/**
 * Chạy ERROR_MONITOR_AGENT độc lập — tạo Bug Report thật cho BUG_FIX_AGENT.
 *
 *   node server/errorMonitor/cli.mjs
 *   node server/errorMonitor/cli.mjs --demo backend-500
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createErrorMonitorAgent } from "./agent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMOS = {
  "backend-500": {
    source: "backend",
    service: "tecsops",
    module: "stateStore",
    error_type: "Error",
    message: "Internal Server Error while loading /api/state",
    stack_trace: "Error: Internal Server Error\n    at loadState (server/stateStore.mjs)\n    at app.get (server/index.mjs)",
    http: { method: "GET", status: 500, path: "/api/state" },
    user_flow: "ops_dashboard_load",
    environment: "production",
  },
  "db-down": {
    source: "backend",
    module: "db",
    error_type: "DatabaseUnavailable",
    message: "connect ECONNREFUSED 127.0.0.1:5432 — Postgres unavailable",
    http: { method: "GET", status: 503, path: "/api/health" },
  },
};

async function main() {
  const demoName = process.argv.includes("--demo")
    ? process.argv[process.argv.indexOf("--demo") + 1] || "backend-500"
    : "backend-500";
  const raw = DEMOS[demoName] || DEMOS["backend-500"];
  const queueDir = path.join(__dirname, "..", "data", "error-monitor");
  const agent = createErrorMonitorAgent({
    queueDir,
    environment: "cli",
    release: "error-monitor-cli",
  });
  const result = await agent.ingest(raw);
  const report = result.bug_report;
  console.log(JSON.stringify({
    ok: result.ok,
    fingerprint: result.fingerprint,
    classification: result.classification,
    severity: result.severity,
    dispatched: result.dispatched,
    bug_id: report?.bug_id || null,
    queue: path.join(queueDir, "outbox", report ? `${report.bug_id}.json` : ""),
    summary: report?.summary || null,
  }, null, 2));
  if (!result.ok || !report) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[errorMonitor/cli]", err);
  process.exit(1);
});
