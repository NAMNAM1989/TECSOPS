import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { setPostgresStateStore } from "../stateStore.mjs";
import { baseContractState } from "../stateMutationContractFixtures.mjs";
import {
  createSheetWebhookHandler,
  inferSessionDateFromTab,
  registerSheetWebhookRoutes,
  sheetSecretMatches,
} from "./sheetWebhook.mjs";
import { runSheetAutoSyncOnce, vnTodayAndTomorrow } from "./sheetAutoSync.mjs";
import { resetSheetRealtimeStatus } from "./sheetRealtimeStatus.mjs";
import { resetWebhookApplyMemory } from "./sheetApply.mjs";

const SHEET_ID = "15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4";
const SECRET = "test-secret-123";
const TAB = "NGÀY 14 OCT";
const SESSION = "2026-10-14";
const AWB_A = "618-11112222";
const AWB_B = "618-33334444";
const START = Date.parse("2026-10-14T05:00:00Z");

const ENV_KEYS = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NAMNAMLOGISTICS_SUPABASE_URL",
  "NAMNAMLOGISTICS_SUPABASE_ANON_KEY",
  "SHEET_WEBHOOK_SECRET",
];
const savedEnv = {};

beforeAll(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  setPostgresStateStore(null);
});

function sheetValues(awb, { pcsKg = "20/100", warehouse = "TECS-SCSC", note = "" } = {}) {
  return ["1", awb, "SQ185/14OCT", "17:00 - 14OCT", "SIN", warehouse, pcsKg, "ACME", "SHIPPER CO", "CNEE CO", "", note];
}

function lot(id, awb, sessionDate, extra = {}) {
  return {
    id,
    stt: 1,
    sessionDate,
    awb,
    flight: "SQ185",
    flightDate: "14OCT",
    cutoff: "17:00",
    cutoffNote: "14OCT",
    note: "",
    dest: "SIN",
    warehouse: "TECS-SCSC",
    pcs: 20,
    kg: 100,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "ACME",
    customerId: "cust-1",
    shipperNamePrint: "SHIPPER CO",
    consigneeNamePrint: "CNEE CO",
    status: "PENDING",
    ...extra,
  };
}

/** Postgres store giả trong RAM — cùng hợp đồng runLocked/loadRawState với store thật. */
function createFakeStore(rows = []) {
  let raw = { ...baseContractState(), version: 1, rows };
  const store = {
    key: "test",
    loads: 0,
    /** @type {Promise<void> | null} */
    gate: null,
    async loadRawState() {
      store.loads += 1;
      if (store.gate) await store.gate;
      return structuredClone(raw);
    },
    async saveState(s) {
      raw = structuredClone(s);
    },
    async peekVersion() {
      return raw.version;
    },
    async runLocked(fn) {
      const out = await fn(structuredClone(raw));
      const next = out?.__tecsopsPersistDiff ? out.next : out;
      raw = structuredClone(next);
      return next;
    },
    get rows() {
      return raw.rows;
    },
  };
  setPostgresStateStore(store);
  return store;
}

function createFakeIo() {
  const io = {
    /** @type {{ event: string, payload: unknown }[]} */
    events: [],
    syncCount: 0,
    emit(event, payload) {
      io.events.push({ event, payload });
    },
    async fetchSockets() {
      return [
        {
          data: { stateScope: { full: true, sessionDate: null } },
          emit(event) {
            if (event === "sync") io.syncCount += 1;
          },
        },
      ];
    },
  };
  return io;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

async function startWebhook({ secret = SECRET } = {}) {
  const clock = { t: START };
  const io = createFakeIo();
  const webhook = createSheetWebhookHandler({
    io,
    getSecret: () => secret,
    getSpreadsheetId: () => SHEET_ID,
    now: () => clock.t,
  });
  const app = express();
  app.use(express.json());
  app.post("/hook", webhook.rateLimit, webhook.handle);
  const http = await listen(app);
  const post = (body, headers = { "X-Sheet-Secret": SECRET }) =>
    fetch(`${http.baseUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { clock, io, http, post };
}

function fullTab(rows, extra = {}) {
  return {
    sheetId: SHEET_ID,
    tabName: TAB,
    gid: "123",
    mode: "full",
    batchIndex: 0,
    batchCount: 1,
    batchId: "b1",
    rows,
    ...extra,
  };
}

function editRows(rows) {
  return { sheetId: SHEET_ID, tabName: TAB, gid: "123", mode: "rows", rows };
}

async function waitFor(check, timeoutMs = 2000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  resetSheetRealtimeStatus();
  resetWebhookApplyMemory();
});

describe("sheet webhook — xác thực", () => {
  it("thiếu SHEET_WEBHOOK_SECRET ⇒ 503 (endpoint tắt)", async () => {
    const app = express();
    app.use(express.json());
    registerSheetWebhookRoutes(app, { requireAuth: (_q, _s, next) => next() });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/sheets/book/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sheet-Secret": "x" },
        body: JSON.stringify(fullTab([])),
      });
      expect(res.status).toBe(503);
    } finally {
      await http.close();
    }
  });

  it("sai hoặc thiếu secret ⇒ 401", async () => {
    createFakeStore();
    const { http, post } = await startWebhook();
    try {
      expect((await post(fullTab([]), { "X-Sheet-Secret": "wrong" })).status).toBe(401);
      expect((await post(fullTab([]), {})).status).toBe(401);
    } finally {
      await http.close();
    }
  });

  it("sheetId sai ⇒ 400", async () => {
    createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const res = await post(fullTab([], { sheetId: "khac" }));
      expect(res.status).toBe(400);
    } finally {
      await http.close();
    }
  });

  it("quá 200 dòng ⇒ 400", async () => {
    createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const rows = Array.from({ length: 201 }, (_, i) => ({ rowNumber: i + 1, values: [] }));
      expect((await post(fullTab(rows))).status).toBe(400);
    } finally {
      await http.close();
    }
  });

  it("so sánh secret an toàn khi khác độ dài", () => {
    expect(sheetSecretMatches("abc", "abc")).toBe(true);
    expect(sheetSecretMatches("abc", "abcd")).toBe(false);
    expect(sheetSecretMatches("", "abc")).toBe(false);
  });
});

describe("sheet webhook — khớp/áp", () => {
  it("dòng mới ⇒ INSERT + broadcast một lần", async () => {
    const store = createFakeStore();
    const { io, http, post } = await startWebhook();
    try {
      const res = await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toBe(1);
      expect(body.applied).toBe(1);
      const added = store.rows.find((r) => r.awb.replace(/\D/g, "") === "61811112222");
      expect(added?.sessionDate).toBe(SESSION);
      expect(added?.pcs).toBe(20);
      expect(io.syncCount).toBe(1);
      expect(io.events.some((e) => e.event === "sheetSync")).toBe(true);
    } finally {
      await http.close();
    }
  });

  it("dòng đổi ⇒ UPDATE, giữ field chỉ có trên web", async () => {
    const store = createFakeStore([
      lot("l-1", AWB_A, SESSION, { goodsDescriptionPrint: "WEB ONLY", status: "PENDING" }),
    ]);
    const { io, http, post } = await startWebhook();
    try {
      const res = await post(
        fullTab([{ rowNumber: 5, values: sheetValues(AWB_A, { pcsKg: "25/130" }) }])
      );
      const body = await res.json();
      expect(body.updated).toBe(1);
      expect(body.added).toBe(0);
      const row = store.rows.find((r) => r.id === "l-1");
      expect(row?.pcs).toBe(25);
      expect(row?.kg).toBe(130);
      expect(row?.goodsDescriptionPrint).toBe("WEB ONLY");
      expect(store.rows).toHaveLength(1);
      expect(io.syncCount).toBe(1);
    } finally {
      await http.close();
    }
  });

  it("dòng không đổi ⇒ không ghi, không broadcast", async () => {
    createFakeStore([lot("l-1", AWB_A, SESSION)]);
    const { io, http, post } = await startWebhook();
    try {
      const res = await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]));
      const body = await res.json();
      expect(body.applied).toBe(0);
      expect(body.skipped).toEqual([expect.objectContaining({ rowNumber: 5, code: "unchanged" })]);
      expect(io.syncCount).toBe(0);
      expect(io.events).toHaveLength(0);
    } finally {
      await http.close();
    }
  });

  it("AWB đã ở phiên khác ⇒ skip có lý do", async () => {
    const store = createFakeStore([lot("l-old", AWB_A, "2026-10-10")]);
    const { io, http, post } = await startWebhook();
    try {
      const body = await (await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]))).json();
      expect(body.applied).toBe(0);
      expect(body.skipped[0]).toMatchObject({ rowNumber: 5, code: "awb_taken" });
      expect(body.skipped[0].reason).toMatch(/2026-10-10/);
      expect(store.rows).toHaveLength(1);
      const conflictEvent = io.events.find((e) => e.event === "sheetSync");
      expect(conflictEvent?.payload?.conflicts?.[0]?.code).toBe("awb_taken");
    } finally {
      await http.close();
    }
  });

  it("AWB trùng trong Sheet ⇒ dòng sau bị skip", async () => {
    const store = createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const body = await (
        await post(
          fullTab([
            { rowNumber: 5, values: sheetValues(AWB_A) },
            { rowNumber: 6, values: sheetValues(AWB_A, { pcsKg: "1/1" }) },
          ])
        )
      ).json();
      expect(body.added).toBe(1);
      expect(body.skipped).toEqual([
        expect.objectContaining({ rowNumber: 6, code: "sheet_duplicate" }),
      ]);
      expect(store.rows).toHaveLength(1);
    } finally {
      await http.close();
    }
  });

  it("sửa dòng lẻ dùng bản chụp tab: phát hiện trùng với dòng phía trên", async () => {
    const store = createFakeStore();
    const { clock, http, post } = await startWebhook();
    try {
      await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]));
      clock.t += 10_000;
      const body = await (
        await post(editRows([{ rowNumber: 9, values: sheetValues(AWB_A, { pcsKg: "9/9" }) }]))
      ).json();
      expect(body.skipped[0]).toMatchObject({ rowNumber: 9, code: "sheet_duplicate" });
      clock.t += 10_000;
      const b2 = await (await post(editRows([{ rowNumber: 9, values: sheetValues(AWB_B) }]))).json();
      expect(b2.added).toBe(1);
      expect(store.rows).toHaveLength(2);
    } finally {
      await http.close();
    }
  });

  it("chưa có bản chụp tab ⇒ yêu cầu gửi cả tab", async () => {
    createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const body = await (await post(editRows([{ rowNumber: 5, values: sheetValues(AWB_A) }]))).json();
      expect(body.needFullTab).toBe(true);
    } finally {
      await http.close();
    }
  });

  it("request trùng trong 5 s ⇒ bỏ qua", async () => {
    const store = createFakeStore();
    const { clock, http, post } = await startWebhook();
    try {
      const payload = fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]);
      await post(payload);
      const loadsAfterFirst = store.loads;
      clock.t += 2000;
      const body = await (await post(payload)).json();
      expect(body.deduped).toBe(1);
      expect(store.loads).toBe(loadsAfterFirst);
      clock.t += 6000;
      const later = await (await post(payload)).json();
      expect(later.deduped).toBeUndefined();
      expect(store.loads).toBeGreaterThan(loadsAfterFirst);
    } finally {
      await http.close();
    }
  });

  it("tab không phải tab ngày ⇒ bỏ qua, không ghi", async () => {
    const store = createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const body = await (
        await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }], { tabName: "MẪU", gid: "9" }))
      ).json();
      expect(body.ignored).toBe("not_session_tab");
      expect(store.loads).toBe(0);
    } finally {
      await http.close();
    }
  });

  it("AWB chưa đủ 11 số ⇒ chờ, không tạo lô", async () => {
    const store = createFakeStore();
    const { http, post } = await startWebhook();
    try {
      const body = await (await post(fullTab([{ rowNumber: 5, values: sheetValues("618-111122") }]))).json();
      expect(body.skipped[0]).toMatchObject({ code: "awb_incomplete" });
      expect(store.rows).toHaveLength(0);
    } finally {
      await http.close();
    }
  });
});

describe("sheet auto-sync", () => {
  it("không chạy chồng webhook — đợi khoá rồi mới đọc state", async () => {
    const store = createFakeStore();
    const { http, post } = await startWebhook();
    /** @type {() => void} */
    let release = () => {};
    store.gate = new Promise((r) => {
      release = r;
    });
    try {
      const webhookDone = post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]));
      await waitFor(() => store.loads === 1);

      const [today] = vnTodayAndTomorrow(START);
      const autoDone = runSheetAutoSyncOnce({
        now: () => START,
        loadGrid: async (sessionDate) => {
          if (sessionDate !== today) throw new Error("Không có tab Sheet cho ngày");
          return {
            sheetTab: TAB,
            grid: [
              { rowIndex: 0, cells: sheetValues(AWB_A) },
              { rowIndex: 1, cells: sheetValues(AWB_B) },
            ],
          };
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(store.loads).toBe(1);

      store.gate = null;
      release();
      const [res, auto] = await Promise.all([webhookDone, autoDone]);
      expect(res.status).toBe(200);
      expect(store.loads).toBe(2);
      expect(auto.sessions[0]).toMatchObject({ sessionDate: SESSION, added: 1, mutated: true });
      expect(store.rows).toHaveLength(2);
    } finally {
      release();
      await http.close();
    }
  });

  it("không có thay đổi ⇒ không broadcast", async () => {
    createFakeStore([lot("l-1", AWB_A, SESSION)]);
    const io = createFakeIo();
    const out = await runSheetAutoSyncOnce({
      io,
      now: () => START,
      loadGrid: async (sessionDate) => {
        if (sessionDate !== SESSION) throw new Error("Không có tab Sheet cho ngày");
        return { sheetTab: TAB, grid: [{ rowIndex: 0, cells: sheetValues(AWB_A) }] };
      },
    });
    expect(out.sessions[0]).toMatchObject({ mutated: false });
    expect(io.syncCount).toBe(0);
    expect(io.events).toHaveLength(0);
  });
});

describe("sheet realtime — lỗi Bugbot PR #82", () => {
  it("auto-sync không ghi đè lô webhook vừa cập nhật, vẫn thêm lô bị lỡ", async () => {
    const store = createFakeStore([lot("l-1", AWB_A, SESSION)]);
    const { clock, http, post } = await startWebhook();
    try {
      clock.t = START + 5 * 60_000;
      const hook = await (await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A, { pcsKg: "9/90" }) }]))).json();
      expect(hook.updated).toBe(1);
      // gviz còn trễ: vẫn thấy 20/100 cho AWB_A, và có thêm AWB_B mà webhook bỏ lỡ.
      const auto = await runSheetAutoSyncOnce({
        now: () => START + 6 * 60_000,
        loadGrid: async (sessionDate) => {
          if (sessionDate !== SESSION) throw new Error("Không có tab Sheet cho ngày");
          return {
            sheetTab: TAB,
            grid: [
              { rowIndex: 0, cells: sheetValues(AWB_A) },
              { rowIndex: 1, cells: sheetValues(AWB_B) },
            ],
          };
        },
      });
      expect(auto.sessions[0]).toMatchObject({ added: 1, updated: 0 });
      const a = store.rows.find((r) => r.awb.replace(/\D/g, "") === AWB_A.replace(/\D/g, ""));
      expect(a).toMatchObject({ pcs: 9, kg: 90 });
      expect(store.rows).toHaveLength(2);
    } finally {
      await http.close();
    }
  });

  it("gửi cả tab bị đứt giữa chừng ⇒ sửa dòng lẻ xin lại cả tab", async () => {
    createFakeStore();
    const { clock, http, post } = await startWebhook();
    try {
      await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }], { batchCount: 2, batchId: "b9" }));
      clock.t += 10_000;
      const body = await (await post(editRows([{ rowNumber: 9, values: sheetValues(AWB_B) }]))).json();
      expect(body.needFullTab).toBe(true);
    } finally {
      await http.close();
    }
  });

  // Hợp đồng cho tools/apps-script/Code.gs: dòng xoá trắng PHẢI được gửi lên thì AWB cũ mới rời bản chụp.
  it("ghi state thất bại ⇒ chưa đánh dấu webhook, auto-sync vẫn cập nhật được lô", async () => {
    const store = createFakeStore([lot("l-1", AWB_A, SESSION)]);
    const originalRunLocked = store.runLocked.bind(store);
    let failed = false;
    store.runLocked = async (fn) => {
      if (!failed) {
        failed = true;
        throw new Error("db down");
      }
      return originalRunLocked(fn);
    };
    const { http, post } = await startWebhook();
    try {
      const res = await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A, { pcsKg: "9/90" }) }]));
      expect(res.status).toBe(500);
      expect(store.rows[0]).toMatchObject({ pcs: 20, kg: 100 });
      const auto = await runSheetAutoSyncOnce({
        now: () => START + 60_000,
        loadGrid: async (sessionDate) => {
          if (sessionDate !== SESSION) throw new Error("Không có tab Sheet cho ngày");
          return {
            sheetTab: TAB,
            grid: [{ rowIndex: 0, cells: sheetValues(AWB_A, { pcsKg: "9/90" }) }],
          };
        },
      });
      expect(auto.sessions[0]).toMatchObject({ updated: 1, mutated: true });
      expect(store.rows[0]).toMatchObject({ pcs: 9, kg: 90 });
    } finally {
      await http.close();
    }
  });

  it("gửi lại lô 0 trong 5s không cắt mất dòng của lô sau", async () => {
    const store = createFakeStore();
    const { clock, http, post } = await startWebhook();
    try {
      await post(
        fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }], {
          batchCount: 2,
          batchId: "b9",
          batchIndex: 0,
        })
      );
      clock.t += 1000;
      await post(
        fullTab([{ rowNumber: 205, values: sheetValues(AWB_B) }], {
          batchCount: 2,
          batchId: "b9",
          batchIndex: 1,
        })
      );
      expect(store.rows).toHaveLength(2);
      clock.t += 1000;
      const retry = await (
        await post(
          fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }], {
            batchCount: 2,
            batchId: "b9",
            batchIndex: 0,
          })
        )
      ).json();
      expect(retry.deduped).toBe(1);
      clock.t += 10_000;
      // Dòng sau lô 1: nếu bản chụp còn dòng 205 thì AWB_B là trùng Sheet, không ghi đè lô.
      const body = await (
        await post(editRows([{ rowNumber: 400, values: sheetValues(AWB_B, { pcsKg: "9/90" }) }]))
      ).json();
      expect(body.needFullTab).not.toBe(true);
      expect(body.skipped.map((s) => s.code)).toContain("sheet_duplicate");
      expect(store.rows).toHaveLength(2);
      const b = store.rows.find((r) => r.awb.replace(/\D/g, "") === AWB_B.replace(/\D/g, ""));
      expect(b).toMatchObject({ pcs: 20, kg: 100 });
    } finally {
      await http.close();
    }
  });

  it("nhận dòng xoá trắng ⇒ dùng lại AWB ở dòng khác không bị coi là trùng", async () => {
    const store = createFakeStore();
    const { clock, http, post } = await startWebhook();
    try {
      await post(fullTab([{ rowNumber: 5, values: sheetValues(AWB_A) }]));
      clock.t += 10_000;
      await post(editRows([{ rowNumber: 5, values: Array(12).fill("") }]));
      clock.t += 10_000;
      const body = await (
        await post(editRows([{ rowNumber: 9, values: sheetValues(AWB_A, { pcsKg: "9/90" }) }]))
      ).json();
      expect(body.skipped.map((s) => s.code)).not.toContain("sheet_duplicate");
      expect(body.updated).toBe(1);
      expect(store.rows[0]).toMatchObject({ pcs: 9, kg: 90 });
    } finally {
      await http.close();
    }
  });
});

describe("inferSessionDateFromTab", () => {
  it("chọn năm gần hôm nay nhất (giờ VN)", () => {
    expect(inferSessionDateFromTab("NGÀY 14 OCT", START)).toBe("2026-10-14");
    expect(inferSessionDateFromTab("NGAY 2 JAN", Date.parse("2026-12-30T05:00:00Z"))).toBe("2027-01-02");
    expect(inferSessionDateFromTab("NGÀY 30 DEC", Date.parse("2027-01-01T05:00:00Z"))).toBe("2026-12-30");
  });

  it("tab không có ngày ⇒ null", () => {
    expect(inferSessionDateFromTab("MẪU", START)).toBeNull();
    expect(inferSessionDateFromTab("NGÀY 31 FEB", START)).toBeNull();
  });

  it("ranh giới ngày theo giờ VN (UTC+7)", () => {
    expect(vnTodayAndTomorrow(Date.parse("2026-10-14T16:30:00Z"))).toEqual(["2026-10-14", "2026-10-15"]);
    expect(vnTodayAndTomorrow(Date.parse("2026-10-14T17:30:00Z"))).toEqual(["2026-10-15", "2026-10-16"]);
  });
});
