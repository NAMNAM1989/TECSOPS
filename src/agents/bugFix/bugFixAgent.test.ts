import { describe, expect, it } from "vitest";
import {
  BugFixAgent,
  SYSTEM_PROMPT_PRINCIPLES,
  alreadyAttempted,
  attemptSignature,
  bugReportFromMonitorEvent,
  canTransition,
  commentOnlyPlan,
  createMemoryHost,
  createMemoryPlaywright,
  createMemorySessionStore,
  detectOscillation,
  detectProtectedOperations,
  redactSecrets,
  runBugFixAgent,
} from "./index";
import { BUG_FIX_AGENT_SYSTEM_PROMPT } from "./systemPrompt";

const ADD_SRC = "export function add(a: number, b: number): number { return a - b; }\n";
const COMPUTE_SRC = "export function compute(n: number): number { return n - 1; }\n";
const LOGIN_SRC = 'export function tcsLoginLabel() { return "Login"; }\n';

describe("BugFixAgent system prompt", () => {
  it("chứa đủ nguyên tắc bắt buộc", () => {
    for (const principle of SYSTEM_PROMPT_PRINCIPLES) {
      expect(BUG_FIX_AGENT_SYSTEM_PROMPT).toContain(principle);
    }
    expect(BUG_FIX_AGENT_SYSTEM_PROMPT).toContain("Đăng Nhập TCS");
    expect(BUG_FIX_AGENT_SYSTEM_PROMPT).not.toMatch(/\bĐN\b/);
  });
});

describe("state machine + permissions", () => {
  it("cho phép luồng chuẩn và chặn nhảy cóc", () => {
    expect(canTransition("RECEIVED", "COLLECTING_CONTEXT")).toBe(true);
    expect(canTransition("REGRESSION_CHECK", "RESOLVED")).toBe(true);
    expect(canTransition("RECEIVED", "RESOLVED")).toBe(false);
    expect(canTransition("RESOLVED", "IMPLEMENTING")).toBe(false);
    expect(canTransition("TESTING", "DIAGNOSING")).toBe(true);
  });

  it("nhận diện thao tác nguy hiểm", () => {
    expect(detectProtectedOperations("please prisma migrate reset on production")).toContain(
      "Destructive DB migration/reset",
    );
    expect(detectProtectedOperations("force push to main")).toContain("Force push");
  });

  it("anti-loop phát hiện A→B→A", () => {
    const a = attemptSignature("a", [{ path: "f.ts", content: "1" }]);
    const b = attemptSignature("b", [{ path: "f.ts", content: "2" }]);
    expect(
      detectOscillation([
        { index: 1, signature: a, strategy: "a", files: ["f.ts"], passed: false, evidence: [] },
        { index: 2, signature: b, strategy: "b", files: ["f.ts"], passed: false, evidence: [] },
        { index: 3, signature: a, strategy: "a", files: ["f.ts"], passed: false, evidence: [] },
      ]),
    ).toBe(true);
    expect(alreadyAttempted([{ index: 1, signature: a, strategy: "a", files: ["f.ts"], passed: false, evidence: [] }], a)).toBe(
      true,
    );
  });

  it("redact secrets trong log", () => {
    expect(redactSecrets("password=hunter2 token=abc")).toContain("[REDACTED]");
    expect(redactSecrets("password=hunter2")).not.toContain("hunter2");
  });
});

describe("Scenario A — Simple Code Bug", () => {
  it("tìm root cause, sửa, verify, RESOLVED", async () => {
    const host = createMemoryHost({
      files: { "src/calc.ts": ADD_SRC },
    });
    const store = createMemorySessionStore();
    const output = await runBugFixAgent(
      {
        bug_id: "A1",
        description: "add(1, 2) trả -1 thay vì 3",
        module: "src/calc.ts",
        files: ["src/calc.ts"],
        cases: [{ name: "1+2", functionName: "add", input: [1, 2], expected: 3 }],
        category: "code",
      },
      { host, store },
    );

    expect(output.reproduction.confirmed).toBe(true);
    expect(output.root_cause.summary).toMatch(/add/);
    expect(output.root_cause.confidence).toBe("HIGH");
    expect(output.fix.files_changed).toContain("src/calc.ts");
    expect(host.files.get("src/calc.ts")).toContain("a + b");
    expect(output.verification.unit_tests).toBe("PASS");
    expect(output.verification.typecheck).toBe("PASS");
    expect(output.status).toBe("RESOLVED");
    expect(output.phase).toBe("RESOLVED");
    expect(store.sessions.size).toBe(1);
  });
});

describe("Scenario B — Failed Fix then recover without looping", () => {
  it("fix đầu thất bại, phân tích evidence mới, không vòng lặp vô hạn", async () => {
    const host = createMemoryHost({
      files: { "src/compute.ts": COMPUTE_SRC },
    });
    const store = createMemorySessionStore();
    const agent = new BugFixAgent({ host, store });
    const output = await agent.run({
      bug_id: "B1",
      description: "compute(5) phải ra 11",
      files: ["src/compute.ts"],
      cases: [{ name: "five", functionName: "compute", input: [5], expected: 11 }],
      regression_cases: [{ name: "three", functionName: "compute", input: [3], expected: 7 }],
      category: "code",
    });

    expect(output.status).toBe("RESOLVED");
    expect(host.files.get("src/compute.ts")).toMatch(/n \* 2 \+ 1/);
    expect(output.regression.checked).toBe(true);
    expect(output.regression.result).toBe("PASS");
    expect(agent.getSession()?.attempts.length).toBeGreaterThanOrEqual(2);
    expect(host.writes.length).toBeGreaterThanOrEqual(2);
    expect(host.writes.length).toBeLessThan(6);
  });

  it("dừng khi cùng một fix thất bại được lặp lại", async () => {
    const host = createMemoryHost({
      files: { "src/compute.ts": COMPUTE_SRC },
    });
    const store = createMemorySessionStore();
    const output = await runBugFixAgent(
      {
        bug_id: "B2",
        description: "compute(5) phải ra 11",
        files: ["src/compute.ts"],
        cases: [{ name: "five", functionName: "compute", input: [5], expected: 11 }],
        category: "code",
      },
      {
        host,
        store,
        config: { maxFailedImplementations: 2 },
        hooks: {
          planFix: ({ files }) => commentOnlyPlan(files, "src/compute.ts"),
        },
      },
    );
    expect(output.status).not.toBe("RESOLVED");
    expect(["FAILED", "NEEDS_REVIEW"]).toContain(output.status);
    expect(host.writes.length).toBeLessThanOrEqual(2);
  });
});

describe("Scenario C — UI Bug (Playwright path)", () => {
  it("dùng Playwright hook để reproduce và verify, không viết tắt Đăng Nhập TCS", async () => {
    const host = createMemoryHost({
      files: { "src/ui/tcsLoginLabel.ts": LOGIN_SRC },
    });
    host.playwright = createMemoryPlaywright({
      isFixed: () => (host.files.get("src/ui/tcsLoginLabel.ts") || "").includes("Đăng Nhập TCS"),
    });

    const output = await runBugFixAgent(
      {
        bug_id: "C1",
        description: 'Nút cổng TCS expected label "Đăng Nhập TCS" got "Login"',
        files: ["src/ui/tcsLoginLabel.ts"],
        ui_workflow: ["open app", "navigate Ops", "assert Đăng Nhập TCS"],
        base_url: "http://127.0.0.1:5173",
        category: "ui",
      },
      { host, store: createMemorySessionStore() },
    );

    expect(output.reproduction.confirmed).toBe(true);
    expect(output.status).toBe("RESOLVED");
    expect(output.verification.e2e).toBe("PASS");
    expect(output.verification.runtime).toBe("PASS");
    expect(host.files.get("src/ui/tcsLoginLabel.ts")).toContain("Đăng Nhập TCS");
    expect(host.files.get("src/ui/tcsLoginLabel.ts")).not.toMatch(/\bĐN\b/);
    expect(output.fix.files_changed).toContain("src/ui/tcsLoginLabel.ts");
  });
});

describe("Scenario D — Dangerous Operation", () => {
  it("destructive DB migration → NEEDS_APPROVAL, không ghi file", async () => {
    const host = createMemoryHost({
      files: { "src/calc.ts": ADD_SRC },
    });
    const output = await runBugFixAgent(
      {
        bug_id: "D1",
        description: "Chạy prisma migrate reset và DROP DATABASE trên production để hết drift",
        requested_operations: ["prisma migrate reset", "DROP DATABASE"],
        files: ["src/calc.ts"],
        category: "ops",
      },
      { host, store: createMemorySessionStore() },
    );

    expect(output.status).toBe("NEEDS_APPROVAL");
    expect(output.phase).toBe("NEEDS_APPROVAL");
    expect(output.requires_approval).toBe(true);
    expect(host.writes).toEqual([]);
    expect(host.files.get("src/calc.ts")).toBe(ADD_SRC);
  });
});

describe("Scenario E — Existing User Changes", () => {
  it("dirty working tree: không ghi đè file user không liên quan", async () => {
    const userNote = "export const draft = 'uncommitted user work';\n";
    const host = createMemoryHost({
      files: {
        "src/calc.ts": ADD_SRC,
        "src/unrelated.ts": userNote,
      },
      dirtyFiles: ["src/unrelated.ts"],
    });
    const output = await runBugFixAgent(
      {
        bug_id: "E1",
        description: "add(1, 2) sai",
        files: ["src/calc.ts"],
        cases: [{ name: "1+2", functionName: "add", input: [1, 2], expected: 3 }],
        category: "code",
      },
      { host, store: createMemorySessionStore() },
    );

    expect(output.status).toBe("RESOLVED");
    expect(host.files.get("src/unrelated.ts")).toBe(userNote);
    expect(host.writes.some((row) => row.path === "src/unrelated.ts")).toBe(false);
    expect(host.files.get("src/calc.ts")).toContain("a + b");
  });

  it("từ chối plan cố ý ghi file dirty không thuộc bug", async () => {
    const userNote = "export const draft = 'keep me';\n";
    const host = createMemoryHost({
      files: {
        "src/calc.ts": ADD_SRC,
        "src/unrelated.ts": userNote,
      },
      dirtyFiles: ["src/unrelated.ts"],
    });
    const output = await runBugFixAgent(
      {
        bug_id: "E2",
        description: "add sai nhưng plan nhầm file",
        files: ["src/calc.ts"],
        cases: [{ name: "1+2", functionName: "add", input: [1, 2], expected: 3 }],
        category: "code",
      },
      {
        host,
        store: createMemorySessionStore(),
        hooks: {
          planFix: () => ({
            strategy: "overwrite unrelated",
            files: [{ path: "src/unrelated.ts", content: "export const draft = 'clobbered';\n", reason: "wrong" }],
            confidence: "HIGH",
            risk: "LOW",
            verification: "none",
          }),
        },
      },
    );

    expect(output.status).toBe("NEEDS_REVIEW");
    expect(host.files.get("src/unrelated.ts")).toBe(userNote);
    expect(output.remaining_risks.join(" ")).toMatch(/unrelated|dirty/i);
  });
});

describe("Scenario F — False Fix", () => {
  it("code compile nhưng behavior vẫn sai → không RESOLVED", async () => {
    const host = createMemoryHost({
      files: { "src/calc.ts": ADD_SRC },
    });
    const output = await runBugFixAgent(
      {
        bug_id: "F1",
        description: "add(1, 2) phải bằng 3",
        files: ["src/calc.ts"],
        cases: [{ name: "1+2", functionName: "add", input: [1, 2], expected: 3 }],
        category: "code",
      },
      {
        host,
        store: createMemorySessionStore(),
        config: { maxFailedImplementations: 1 },
        hooks: {
          planFix: ({ files }) => commentOnlyPlan(files, "src/calc.ts"),
        },
      },
    );

    expect(output.verification.typecheck).toBe("PASS");
    expect(output.verification.unit_tests).toBe("FAIL");
    expect(output.status).not.toBe("RESOLVED");
    expect(output.status).toBe("FAILED");
    expect(host.files.get("src/calc.ts")).toContain("a - b");
    expect(output.remaining_risks.join(" ")).toMatch(/wrong|failed|RESOLVED/i);
  });
});

describe("session persistence + ERROR_MONITOR handshake", () => {
  it("lưu session và resume không mất state", async () => {
    const host = createMemoryHost({ files: { "src/calc.ts": ADD_SRC } });
    const store = createMemorySessionStore();
    const first = await runBugFixAgent(
      {
        bug_id: "P1",
        description: "add(1, 2) sai",
        files: ["src/calc.ts"],
        cases: [{ name: "1+2", functionName: "add", input: [1, 2], expected: 3 }],
      },
      { host, store },
    );
    const saved = await store.loadByBugId("P1");
    expect(saved?.session_id).toBeTruthy();
    const resumed = await new BugFixAgent({ host, store }).resume(saved!.session_id);
    expect(resumed.status).toBe("RESOLVED");
    expect(resumed.bug_id).toBe(first.bug_id);
  });

  it("chuyển event ERROR_MONITOR_AGENT thành bug report", () => {
    const report = bugReportFromMonitorEvent({
      source: "ERROR_MONITOR_AGENT",
      error_id: "err_9",
      message: "TypeError in volumetricDim",
      stack: "Error\n    at lineDimKg (src/utils/volumetricDim.ts:10:1)",
      module: "volumetricDim",
      timestamp: "2026-08-22T00:00:00.000Z",
    });
    expect(report.bug_id).toBe("err_9");
    expect(report.files).toContain("src/utils/volumetricDim.ts");
  });
});
