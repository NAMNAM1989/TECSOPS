import { describe, expect, it } from "vitest";
import {
  ErrorMonitorAgent,
  SYSTEM_PROMPT_PRINCIPLES,
  assertAllowed,
  bugReportFromMonitorEvent,
  can,
  createMemoryMonitorHost,
  sanitizeSecrets,
  sanitizeText,
  toErrorMonitorEvent,
} from "./index";
import { ERROR_MONITOR_AGENT_SYSTEM_PROMPT } from "./systemPrompt";
import { createHealthMonitor } from "./health";
import type { BugFixOutput, BugReport, ErrorMonitorEvent } from "../bugFix/types";

function backend500(overrides: Record<string, unknown> = {}) {
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

function stubOutput(bugId: string, status: BugFixOutput["status"] = "IN_PROGRESS"): BugFixOutput {
  return {
    bug_id: bugId,
    status,
    phase: status === "RESOLVED" ? "RESOLVED" : "RECEIVED",
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

describe("ERROR_MONITOR_AGENT system prompt", () => {
  it("chứa đủ nguyên tắc bắt buộc", () => {
    for (const principle of SYSTEM_PROMPT_PRINCIPLES) {
      expect(ERROR_MONITOR_AGENT_SYSTEM_PROMPT).toContain(principle.slice(0, 24));
    }
    expect(ERROR_MONITOR_AGENT_SYSTEM_PROMPT).toContain("ERROR_MONITOR_AGENT");
    expect(ERROR_MONITOR_AGENT_SYSTEM_PROMPT).toContain("bugReportFromMonitorEvent");
  });
});

describe("ERROR_MONITOR_AGENT scenarios A–H", () => {
  it("A — Backend 500 → fingerprint → Bug Report + ErrorMonitorEvent handshake", async () => {
    const host = createMemoryMonitorHost();
    const seen: Array<{ report: BugReport; event: ErrorMonitorEvent }> = [];
    const agent = new ErrorMonitorAgent({
      host,
      environment: "test",
      runBugFix: (report, event) => {
        seen.push({ report, event });
        return stubOutput(report.bug_id || event.error_id);
      },
    });
    const result = await agent.ingest(backend500());
    expect(result.ok).toBe(true);
    expect(result.fingerprint).toMatch(/^fp_/);
    expect(result.classification).toBe("SOFTWARE_ERROR");
    expect(result.severity).toMatch(/^SEV-[0-2]$/);
    expect(result.dispatched).toBe(true);
    expect(result.bug_report?.created_by).toBe("ERROR_MONITOR_AGENT");
    expect(result.monitor_event?.source).toBe("ERROR_MONITOR_AGENT");
    expect(seen).toHaveLength(1);
    expect(seen[0].event.source).toBe("ERROR_MONITOR_AGENT");
    expect(seen[0].event.error_id).toBeTruthy();
    expect(seen[0].event.message).toMatch(/Internal Server Error/);
    const mapped = bugReportFromMonitorEvent(seen[0].event);
    expect(mapped.bug_id).toBe(seen[0].event.error_id);
    expect(mapped.description).toBe(seen[0].event.message);
    expect(seen[0].report.bug_id).toBe(mapped.bug_id);
    expect(host.persisted.some((item) => item.kind === "outbox")).toBe(true);
    expect(agent.observability.count("BUG_DISPATCHED")).toBe(1);
  });

  it("B — 100 lỗi giống nhau → 1 incident, occurrence_count=100, 1 dispatch", async () => {
    const agent = new ErrorMonitorAgent({ host: createMemoryMonitorHost(), environment: "test" });
    let last;
    for (let i = 0; i < 100; i += 1) {
      last = await agent.ingest(backend500({ event_id: `e-${i}` }));
    }
    expect(last?.incident?.occurrence_count).toBe(100);
    expect(agent.storeView.listIncidents()).toHaveLength(1);
    expect(agent.storeView.dispatched).toHaveLength(1);
    expect(last?.dispatched).toBe(false);
  });

  it("C — BUSINESS_VALIDATION không bàn giao Bug Fix", async () => {
    let calls = 0;
    const agent = new ErrorMonitorAgent({
      host: createMemoryMonitorHost(),
      environment: "test",
      runBugFix: () => {
        calls += 1;
        return stubOutput("x");
      },
    });
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
    expect(calls).toBe(0);
    expect(agent.storeView.dispatched).toHaveLength(0);
  });

  it("D — Playwright selector missing → AUTOMATION_ERROR / EXTERNAL_UI_CHANGE", async () => {
    const agent = new ErrorMonitorAgent({ host: createMemoryMonitorHost(), environment: "test" });
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
    expect(result.event?.automation?.selector).toContain("esid-submit");
    expect(result.dispatched).toBe(false);
  });

  it("E — Authorization token bị redacted trước khi lưu / dispatch", async () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaabbbbbccccc.dddddeeeeefffff";
    const seen: ErrorMonitorEvent[] = [];
    const agent = new ErrorMonitorAgent({
      host: createMemoryMonitorHost(),
      environment: "test",
      runBugFix: (_report, event) => {
        seen.push(event);
        return stubOutput(event.error_id);
      },
    });
    const result = await agent.ingest({
      source: "backend",
      module: "appAuth",
      message: `Authorization: Bearer ${token} rejected`,
      metadata: { authorization: `Bearer ${token}`, cookie: "tecsops_session=abc123secret" },
      http: { status: 500, path: "/api/state" },
    });
    const blob = JSON.stringify(result.event);
    expect(blob).not.toContain(token);
    expect(blob).not.toContain("abc123secret");
    expect(result.event?.message).toMatch(/REDACTED/i);
    expect(JSON.stringify(seen[0])).not.toContain(token);
  });

  it("F — DB unavailable → SEV-1 + escalate ngay", async () => {
    const agent = new ErrorMonitorAgent({ host: createMemoryMonitorHost(), environment: "test" });
    const result = await agent.ingest({
      source: "backend",
      module: "db",
      error_type: "DatabaseUnavailable",
      message: "connect ECONNREFUSED 127.0.0.1:5432 — Postgres unavailable",
      http: { method: "GET", status: 503, path: "/api/health" },
    });
    expect(result.classification).toBe("INFRASTRUCTURE_ERROR");
    expect(result.severity).toBe("SEV-1");
    expect(result.bug_report?.requires_immediate_action).toBe(true);
    expect(agent.storeView.notifications.some((note) => note.kind === "ESCALATED")).toBe(true);
    expect(agent.healthView.snapshot().components.db.status).toBe("UNHEALTHY");
  });

  it("G — fingerprint đã RESOLVED xuất hiện lại → REGRESSION + reopen + re-dispatch", async () => {
    let t = 1_700_000_000_000;
    const host = createMemoryMonitorHost({ now: () => new Date(t).toISOString() });
    let calls = 0;
    const agent = new ErrorMonitorAgent({
      host,
      environment: "test",
      config: { observationWindowMs: 1 },
      runBugFix: (report) => {
        calls += 1;
        return stubOutput(report.bug_id || "g", "IN_PROGRESS");
      },
    });
    const first = await agent.ingest(backend500());
    expect(first.dispatched).toBe(true);
    agent.acceptFixResult({
      bug_id: first.bug_report?.bug_id,
      status: "RESOLVED",
      root_cause: "null deref in loadState",
      remaining_risk: "low",
    });
    expect(first.bug_report && agent.storeView.getBug(first.bug_report.bug_id)?.status).toBe(
      "FIXED_PENDING_OBSERVATION",
    );
    t += 5_000;
    const resolved = agent.observePostFix();
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe("RESOLVED");
    t += 1_000;
    const again = await agent.ingest(backend500({ event_id: "after-fix" }));
    expect(agent.observability.count("REGRESSION_DETECTED")).toBe(1);
    expect(again.dispatched).toBe(true);
    expect(calls).toBe(2);
  });

  it("H — 10_000 lỗi giống nhau: gộp + rate-limit, AI không gọi 10k lần", async () => {
    let llmCalls = 0;
    let fixCalls = 0;
    const agent = new ErrorMonitorAgent({
      host: createMemoryMonitorHost(),
      environment: "test",
      config: { stormThreshold: 200, llmMaxCallsPerWindow: 3 },
      llmClassifyFn: () => {
        llmCalls += 1;
        return { classification: "SOFTWARE_ERROR", confidence: 0.5, reason: "mock" };
      },
      runBugFix: (report) => {
        fixCalls += 1;
        return stubOutput(report.bug_id || "h");
      },
    });
    const started = Date.now();
    let last;
    for (let i = 0; i < 10_000; i += 1) {
      last = await agent.ingest(backend500({ event_id: `storm-${i}` }));
    }
    expect(last?.incident?.occurrence_count).toBe(10_000);
    expect(agent.storeView.listIncidents()).toHaveLength(1);
    expect(fixCalls).toBe(1);
    expect(llmCalls).toBeLessThan(10);
    expect(agent.llm.callCount).toBeLessThan(10);
    expect(agent.observability.count("STORM_AGGREGATED")).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});

describe("handshake + permissions + health", () => {
  it("toErrorMonitorEvent khớp type bugFix", () => {
    const event = toErrorMonitorEvent(
      {
        event_id: "evt_1",
        timestamp: "2026-08-22T00:00:00.000Z",
        environment: "test",
        source: "backend",
        service: "tecsops",
        module: "volumetricDim",
        error_type: "TypeError",
        message: "TypeError in volumetricDim",
        stack_trace: "Error\n    at lineDimKg (src/utils/volumetricDim.ts:10:1)",
        request_id: null,
        trace_id: null,
        user_flow: null,
        url: null,
        http: { status: 500, path: "/api/state", method: "GET", route: null },
        job_id: null,
        automation: null,
        browser: null,
        release: null,
        git_commit: null,
        collected_by: "ERROR_MONITOR_AGENT",
        metadata: {},
      },
      "err_9",
    );
    expect(event.source).toBe("ERROR_MONITOR_AGENT");
    const report = bugReportFromMonitorEvent(event);
    expect(report.bug_id).toBe("err_9");
    expect(report.files).toContain("src/utils/volumetricDim.ts");
  });

  it("redact JWT / Bearer / .env", () => {
    const { sanitized, redacted_count } = sanitizeSecrets({
      authorization: "Bearer secret-token-value",
      password: "hunter2",
      note: "GEMINI_API_KEY=abc123secret",
    });
    expect(redacted_count).toBeGreaterThan(0);
    expect(JSON.stringify(sanitized)).not.toContain("hunter2");
    expect(sanitizeText("Authorization: Bearer abcdefghijklmnop")).toMatch(/REDACTED/);
  });

  it("deny sửa source / deploy", () => {
    expect(can("CREATE_EVENT")).toBe(true);
    expect(can("source_edit")).toBe(false);
    expect(() => assertAllowed("DENY_SOURCE_EDIT")).toThrow(/từ chối/);
  });

  it("HTTP 200 không đủ HEALTHY; heartbeat mất có trần restart", () => {
    let now = "2026-08-22T00:00:00.000Z";
    const restarts: number[] = [];
    const health = createHealthMonitor(
      { now: () => now, randomId: () => "x" },
      {
        staleMs: 1_000,
        maxRestarts: 3,
        restartFn: (info) => restarts.push(info.attempt),
      },
    );
    health.recordBackend({ httpStatus: 200, postgres: false, errorRate: 0 });
    expect(health.snapshot().components.backend.status).not.toBe("HEALTHY");
    health.beatWorker("pc-kho");
    expect(health.snapshot().components.workers.status).toBe("HEALTHY");
    now = "2026-08-22T00:00:06.000Z";
    expect(health.snapshot().components.workers.status).toBe("UNHEALTHY");
    health.refreshWorkers();
    health.refreshWorkers();
    expect(restarts).toEqual([1, 2, 3]);
    health.refreshWorkers();
    expect(restarts).toEqual([1, 2, 3]);
  });

  it("không tự đóng RESOLVED khi Bug Fix trả RESOLVED", async () => {
    const agent = new ErrorMonitorAgent({ host: createMemoryMonitorHost(), environment: "test" });
    const first = await agent.ingest(backend500());
    agent.acceptFixResult({
      bug_id: first.bug_report?.bug_id,
      status: "RESOLVED",
      root_cause: "x",
      remaining_risk: "none",
    });
    expect(agent.storeView.getBug(first.bug_report!.bug_id)?.status).toBe("FIXED_PENDING_OBSERVATION");
  });
});
