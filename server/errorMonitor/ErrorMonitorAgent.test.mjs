import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createErrorMonitorAgent } from "./agent.mjs";
import { createMemoryStore } from "./store.mjs";
import { INCIDENT_STATUS, OBS_EVENTS, SEVERITY } from "./constants.mjs";
import { assertAllowed, can } from "./permissions.mjs";
import { sanitizeSecrets, sanitizeText } from "./secretSanitizer.mjs";
import { createHealthMonitor } from "./healthMonitor.mjs";

function backend500(overrides = {}) {
  return {
    source: "backend",
    service: "tecsops",
    module: "stateStore",
    error_type: "Error",
    message: "Internal Server Error while loading /api/state",
    stack_trace:
      "Error: Internal Server Error\n    at loadState (server/stateStore.mjs)\n    at app.get (server/index.mjs)",
    http: { method: "GET", status: 500, path: "/api/state" },
    user_flow: "ops_dashboard_load",
    environment: "test",
    ...overrides,
  };
}

describe("ERROR_MONITOR_AGENT scenarios A–H", () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tmpQueue() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "em-"));
    dirs.push(dir);
    return dir;
  }

  it("A — Backend 500 → detect → fingerprint → severity → Bug Report", async () => {
    const queueDir = tmpQueue();
    const agent = createErrorMonitorAgent({ queueDir, environment: "test" });
    const result = await agent.ingest(backend500());

    expect(result.ok).toBe(true);
    expect(result.fingerprint).toMatch(/^fp_/);
    expect(result.classification).toBe("SOFTWARE_ERROR");
    expect(result.severity).toMatch(/^SEV-[0-2]$/);
    expect(result.dispatched).toBe(true);
    expect(result.bug_report.created_by).toBe("ERROR_MONITOR_AGENT");
    expect(result.bug_report.bug_id).toMatch(/^bug_/);
    expect(result.bug_report.summary).toMatch(/SOFTWARE_ERROR|500/i);
    expect(result.bug_report.monitor_analysis.probable_cause).toBeTruthy();
    expect(result.bug_report.occurrence_count).toBe(1);
    expect(agent.observability.count(OBS_EVENTS.ERROR_DETECTED)).toBe(1);
    expect(agent.observability.count(OBS_EVENTS.FINGERPRINT_CREATED)).toBe(1);
    expect(agent.observability.count(OBS_EVENTS.BUG_DISPATCHED)).toBe(1);

    const queued = fs.readdirSync(path.join(queueDir, "outbox"));
    expect(queued).toHaveLength(1);
    const file = JSON.parse(fs.readFileSync(path.join(queueDir, "outbox", queued[0]), "utf8"));
    expect(file.kind).toBe("BUG_REPORT");
    expect(file.consumed_by).toBe("BUG_FIX_AGENT");
    expect(file.report.bug_id).toBe(result.bug_report.bug_id);
  });

  it("B — 100 lỗi giống nhau → 1 incident, occurrence_count=100, 1 dispatch", async () => {
    const agent = createErrorMonitorAgent({ environment: "test" });
    let last;
    for (let i = 0; i < 100; i += 1) {
      last = await agent.ingest(backend500({ event_id: `e-${i}` }));
    }
    expect(last.incident.occurrence_count).toBe(100);
    expect(agent.store.listIncidents()).toHaveLength(1);
    expect(agent.store.dispatched).toHaveLength(1);
    expect(agent.store.listBugs()).toHaveLength(1);
    expect(last.bug_report.occurrence_count).toBe(100);
    expect(last.dispatched).toBe(false);
  });

  it("C — BUSINESS_VALIDATION không bàn giao Bug Fix", async () => {
    const agent = createErrorMonitorAgent({ environment: "test" });
    const missing = await agent.ingest({
      source: "backend",
      module: "customerDirectory",
      message: "missing field: customerCode",
      http: { status: 400, path: "/api/mutation" },
    });
    const notFound = await agent.ingest({
      source: "backend",
      module: "customerDirectory",
      message: "Customer not found: ACME",
      http: { status: 404, path: "/api/mutation" },
    });
    expect(missing.classification).toBe("BUSINESS_VALIDATION");
    expect(missing.dispatched).toBe(false);
    expect(notFound.classification).toBe("BUSINESS_VALIDATION");
    expect(notFound.dispatched).toBe(false);
    expect(agent.store.dispatched).toHaveLength(0);
    expect(agent.observability.count(OBS_EVENTS.BUG_DISPATCH_SKIPPED)).toBeGreaterThan(0);
  });

  it("D — Playwright selector missing → AUTOMATION_ERROR / EXTERNAL_UI_CHANGE + evidence", async () => {
    const agent = createErrorMonitorAgent({ environment: "test" });
    const result = await agent.ingestAutomation({
      source: "playwright",
      automation_id: "ext_tcs",
      run_id: "run-1",
      workflow: "tcs_esid_fill",
      page_url: "https://www.tcs.com.vn/Esid/Export",
      screenshot: "/tmp/tcs-step-fill.png",
      console_errors: ["Failed to load resource"],
      steps: [
        { name: "login", status: "ok" },
        {
          name: "fill_esid",
          status: "failed",
          selector: "[data-testid=esid-submit]",
          page_url: "https://www.tcs.com.vn/Esid/Export",
          error: "TimeoutError: waiting for locator('[data-testid=esid-submit]')",
        },
      ],
    });
    expect(result.classification).toBe("AUTOMATION_ERROR");
    expect(result.subtype).toBe("EXTERNAL_UI_CHANGE");
    expect(result.event.automation.selector).toContain("esid-submit");
    expect(result.event.automation.page_url).toContain("tcs.com.vn");
    expect(result.event.automation.screenshot).toBeTruthy();
    expect(result.bug_report == null || result.dispatched === false).toBe(true);
  });

  it("E — Authorization token bị redacted trước khi lưu", async () => {
    const agent = createErrorMonitorAgent({ environment: "test" });
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaabbbbbccccc.dddddeeeeefffff";
    const result = await agent.ingest({
      source: "backend",
      module: "appAuth",
      message: `Authorization: Bearer ${token} rejected`,
      headers: { Authorization: `Bearer ${token}` },
      metadata: { authorization: `Bearer ${token}`, cookie: "tecsops_session=abc123secret" },
      http: { status: 500, path: "/api/state" },
    });
    const blob = JSON.stringify(result.event);
    expect(blob).not.toContain(token);
    expect(blob).not.toContain("abc123secret");
    expect(result.event.message).toMatch(/REDACTED/i);
    expect(result.event.metadata.authorization).toBe("[REDACTED]");
    if (result.bug_report) {
      expect(JSON.stringify(result.bug_report)).not.toContain(token);
    }
  });

  it("F — DB unavailable → SEV-1 + escalate ngay", async () => {
    const agent = createErrorMonitorAgent({ environment: "test" });
    const result = await agent.ingest({
      source: "backend",
      module: "db",
      error_type: "DatabaseUnavailable",
      message: "connect ECONNREFUSED 127.0.0.1:5432 — Postgres unavailable",
      http: { method: "GET", status: 503, path: "/api/health" },
    });
    expect(result.classification).toBe("INFRASTRUCTURE_ERROR");
    expect(result.severity).toBe(SEVERITY.SEV_1);
    expect(result.bug_report.requires_immediate_action).toBe(true);
    expect(agent.store.notifications.some((n) => n.kind === "ESCALATED" && n.immediate)).toBe(true);
    expect(agent.observability.count(OBS_EVENTS.ESCALATED)).toBeGreaterThan(0);
    expect(agent.health.snapshot().components.db.status).toBe("UNHEALTHY");
  });

  it("G — fingerprint đã RESOLVED xuất hiện lại → REGRESSION_DETECTED + reopen", async () => {
    let t = 1_000_000;
    const agent = createErrorMonitorAgent({
      environment: "test",
      now: () => t,
      observationWindowMs: 1,
    });
    const first = await agent.ingest(backend500());
    expect(first.dispatched).toBe(true);
    const accepted = agent.acceptFixResult({
      bug_id: first.bug_report.bug_id,
      status: "RESOLVED",
      root_cause: "null deref in loadState (hypothesis from Bug Fix)",
      fix: { summary: "guard empty state" },
      verification: { tests: ["stateStore"], passed: true },
      remaining_risk: "low",
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.bug.status).toBe(INCIDENT_STATUS.FIXED_PENDING_OBSERVATION);
    expect(accepted.incident.status).toBe(INCIDENT_STATUS.FIXED_PENDING_OBSERVATION);

    t += 5_000;
    const resolved = agent.observePostFix();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe(INCIDENT_STATUS.RESOLVED);

    t += 1_000;
    const again = await agent.ingest(backend500({ event_id: "after-fix" }));
    expect(again.incident.status).toMatch(/REGRESSION|DISPATCHED/);
    expect(agent.observability.count(OBS_EVENTS.REGRESSION_DETECTED)).toBe(1);
    expect(again.dispatched).toBe(true);
    expect(agent.store.dispatched.length).toBe(2);
  });

  it("H — 10_000 lỗi giống nhau: gộp + rate-limit, AI không gọi 10k lần", async () => {
    let llmCalls = 0;
    const agent = createErrorMonitorAgent({
      environment: "test",
      stormThreshold: 200,
      llmMaxCallsPerWindow: 3,
      llmClassifyFn: async () => {
        llmCalls += 1;
        return { classification: "SOFTWARE_ERROR", confidence: 0.5, reason: "mock" };
      },
    });
    const started = Date.now();
    let last;
    for (let i = 0; i < 10_000; i += 1) {
      last = await agent.ingest(backend500({ event_id: `storm-${i}` }));
    }
    const elapsed = Date.now() - started;
    expect(last.incident.occurrence_count).toBe(10_000);
    expect(agent.store.listIncidents()).toHaveLength(1);
    expect(agent.store.dispatched).toHaveLength(1);
    expect(llmCalls).toBeLessThan(10);
    expect(agent.llm.callCount).toBeLessThan(10);
    expect(agent.observability.count(OBS_EVENTS.STORM_AGGREGATED)).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(15_000);
  });
});

describe("SecretSanitizer + permissions + health", () => {
  it("redact JWT, Bearer, connection string, .env", () => {
    const { sanitized, redacted_count } = sanitizeSecrets({
      authorization: "Bearer secret-token-value",
      password: "hunter2",
      DATABASE_URL: "postgresql://tecsops:tecsops@127.0.0.1:5434/tecsops",
      note: "GEMINI_API_KEY=abc123secret TCS_PASSWORD=plain",
    });
    expect(redacted_count).toBeGreaterThan(0);
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(JSON.stringify(sanitized)).not.toContain("hunter2");
    expect(JSON.stringify(sanitized)).not.toContain("abc123secret");
    expect(sanitizeText("Authorization: Bearer abcdefghijklmnop")).toMatch(/REDACTED/);
  });

  it("deny sửa source / deploy / migrate", () => {
    expect(can("CREATE_EVENT")).toBe(true);
    expect(can("source_edit")).toBe(false);
    expect(can("prod_deploy")).toBe(false);
    expect(() => assertAllowed("DENY_SOURCE_EDIT")).toThrow(/từ chối/);
  });

  it("HTTP 200 không đủ để HEALTHY; heartbeat mất có trần restart", () => {
    let now = 1_000;
    const restarts = [];
    const health = createHealthMonitor({
      now: () => now,
      staleMs: 1_000,
      maxRestarts: 3,
      restartFn: (info) => restarts.push(info.attempt),
    });
    health.recordBackend({ httpStatus: 200, postgres: false, errorRate: 0 });
    expect(health.snapshot().components.backend.status).not.toBe("HEALTHY");

    health.beatWorker("pc-kho");
    expect(health.snapshot().components.workers.status).toBe("HEALTHY");
    now += 5_000;
    expect(health.snapshot().components.workers.status).toBe("UNHEALTHY");
    health.refreshWorkers();
    health.refreshWorkers();
    expect(restarts).toEqual([1, 2, 3]);
    health.refreshWorkers();
    expect(restarts).toEqual([1, 2, 3]);
  });

  it("không tự đóng RESOLVED khi Bug Fix trả RESOLVED", async () => {
    const store = createMemoryStore();
    const agent = createErrorMonitorAgent({ store, environment: "test" });
    const first = await agent.ingest(backend500());
    agent.acceptFixResult({
      bug_id: first.bug_report.bug_id,
      status: "RESOLVED",
      root_cause: "x",
      fix: {},
      verification: { passed: true },
      remaining_risk: "none",
    });
    expect(store.getBug(first.bug_report.bug_id).status).toBe(
      INCIDENT_STATUS.FIXED_PENDING_OBSERVATION,
    );
    expect(store.getIncidentByFingerprint(first.fingerprint).status).toBe(
      INCIDENT_STATUS.FIXED_PENDING_OBSERVATION,
    );
  });
});
