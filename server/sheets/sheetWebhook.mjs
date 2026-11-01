/**
 * Webhook Google Apps Script → TECSOPS: nhân viên sửa Sheet BOOK, web cập nhật trong vài giây.
 *
 * Apps Script gửi dòng đã sửa (mode "rows") hoặc cả tab theo lô (mode "full").
 * Server giữ bản chụp tab trong RAM (số dòng thật của Sheet) để parse đủ ngữ cảnh
 * (tiêu đề khối TCS/SCSC, header, AWB trùng ở dòng trên) bằng đúng parser + lõi áp hiện có.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { getBookSpreadsheetId, tabTitleMatchesSession } from "./googleSheetFetch.mjs";
import { parseBookHangNgayGrid } from "./bookHangNgayParser.mjs";
import { assignSheetSttByWarehouse, isValidAwb } from "./sheetRowReconcile.mjs";
import { applyParsedSheetRows, sheetSkipCode } from "./sheetApply.mjs";
import { getLastSheetSync, recordSheetSync } from "./sheetRealtimeStatus.mjs";
import { autoSyncConfigFromEnv } from "./sheetAutoSync.mjs";
import { createRateLimit } from "../httpSecurity.mjs";

export const WEBHOOK_MAX_ROWS = 200;
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
const WEBHOOK_COLS = 12;
const MAX_CELL_CHARS = 5000;
const MAX_ROW_NUMBER = 50_000;
const DEDUP_WINDOW_MS = 5000;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_MS = 24 * 60 * 60 * 1000;

function sha256(text) {
  return createHash("sha256").update(String(text)).digest();
}

/** So sánh secret thời gian hằng — băm trước để hai buffer luôn cùng độ dài. */
export function sheetSecretMatches(provided, expected) {
  if (!provided || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

/** YYYY-MM-DD theo giờ Việt Nam (UTC+7). */
export function vnYmd(nowMs) {
  return new Date(nowMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Tab «NGÀY 13 JUL» không có năm — chọn năm gần hôm nay (giờ VN) nhất.
 * @returns {string | null}
 */
export function inferSessionDateFromTab(tabName, nowMs = Date.now()) {
  const compact = String(tabName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const m = compact.match(
    /(?:^|\D)(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\d{2,4})?(?:\D|$)/
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS3.indexOf(m[2]) + 1;
  if (day < 1 || day > 31) return null;
  const today = vnYmd(nowMs);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const baseYear = Number(today.slice(0, 4));
  let best = null;
  let bestDist = Infinity;
  for (const year of [baseYear - 1, baseYear, baseYear + 1]) {
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const ms = Date.parse(`${ymd}T00:00:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== ymd) continue;
    const dist = Math.abs(ms - todayMs);
    if (dist < bestDist) {
      best = ymd;
      bestDist = dist;
    }
  }
  if (!best || bestDist > 200 * DAY_MS) return null;
  return tabTitleMatchesSession(tabName, best) ? best : null;
}

function cellToString(v) {
  if (v == null) return "";
  return String(v).replace(/\r\n/g, "\n").trim().slice(0, MAX_CELL_CHARS);
}

/**
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateWebhookBody(body, expectedSheetId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body phải là object JSON." };
  }
  const sheetId = String(body.sheetId ?? "").trim();
  if (!sheetId || sheetId !== expectedSheetId) {
    return { ok: false, error: "sheetId không đúng Sheet BOOK HẰNG NGÀY." };
  }
  const tabName = String(body.tabName ?? "").trim().slice(0, 120);
  if (!tabName) return { ok: false, error: "Thiếu tabName." };
  const gid = String(body.gid ?? "").trim();
  if (gid && !/^\d{1,12}$/.test(gid)) return { ok: false, error: "gid không hợp lệ." };
  const mode = body.mode === "full" ? "full" : "rows";
  if (!Array.isArray(body.rows)) return { ok: false, error: "rows phải là mảng." };
  if (body.rows.length > WEBHOOK_MAX_ROWS) {
    return { ok: false, error: `Tối đa ${WEBHOOK_MAX_ROWS} dòng mỗi lần.` };
  }
  /** @type {{ rowNumber: number, values: string[] }[]} */
  const rows = [];
  for (const r of body.rows) {
    const rowNumber = Number(r?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_ROW_NUMBER) {
      return { ok: false, error: "rowNumber không hợp lệ." };
    }
    if (!Array.isArray(r?.values)) return { ok: false, error: "values phải là mảng A..L." };
    const values = [];
    for (let i = 0; i < WEBHOOK_COLS; i++) values.push(cellToString(r.values[i]));
    rows.push({ rowNumber, values });
  }
  let batchIndex = 0;
  let batchCount = 1;
  let batchId = "";
  if (mode === "full") {
    batchIndex = Number(body.batchIndex ?? 0);
    batchCount = Number(body.batchCount ?? 1);
    batchId = String(body.batchId ?? "").trim().slice(0, 80);
    if (
      !Number.isInteger(batchIndex) ||
      !Number.isInteger(batchCount) ||
      batchCount < 1 ||
      batchCount > 500 ||
      batchIndex < 0 ||
      batchIndex >= batchCount
    ) {
      return { ok: false, error: "batchIndex/batchCount không hợp lệ." };
    }
    if (batchCount > 1 && !batchId) return { ok: false, error: "Thiếu batchId." };
  }
  return {
    ok: true,
    value: {
      sheetId,
      tabName,
      gid,
      mode,
      rows,
      batchIndex,
      batchCount,
      batchId,
      editedAt: String(body.editedAt ?? "").slice(0, 40),
    },
  };
}

function rowHash(values) {
  return createHash("sha1").update(JSON.stringify(values)).digest("hex");
}

function snapshotToGrid(snapshot) {
  return [...snapshot.rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowNumber, values]) => ({ rowIndex: rowNumber, cells: values }));
}

/**
 * @param {{
 *   io?: import('socket.io').Server,
 *   getSecret?: () => string,
 *   getSpreadsheetId?: () => string,
 *   now?: () => number,
 *   rateLimitMax?: number,
 * }} deps
 */
export function createSheetWebhookHandler(deps = {}) {
  const getSecret = deps.getSecret ?? (() => String(process.env.SHEET_WEBHOOK_SECRET ?? "").trim());
  const getSpreadsheetId = deps.getSpreadsheetId ?? getBookSpreadsheetId;
  const now = deps.now ?? Date.now;

  /** @type {Map<string, { rows: Map<number, string[]>, batchId: string, batchCount: number, received: Set<number>, updatedAt: number }>} */
  const snapshots = new Map();
  /** @type {Map<string, number>} khoá dòng+hash → thời điểm đã xử lý */
  const recentRows = new Map();

  const rateLimit = createRateLimit({
    max: deps.rateLimitMax ?? 60,
    windowMs: 60_000,
    now,
    error: "Webhook Sheet gửi quá nhiều yêu cầu.",
    code: "SHEET_WEBHOOK_RATE_LIMITED",
  });

  function sweep(nowMs) {
    for (const [key, at] of recentRows) {
      if (nowMs - at > DEDUP_WINDOW_MS) recentRows.delete(key);
    }
    for (const [key, snap] of snapshots) {
      if (nowMs - snap.updatedAt > SNAPSHOT_TTL_MS) snapshots.delete(key);
    }
  }

  /** @returns {boolean} false khi cần Apps Script gửi lại cả tab */
  function mergeSnapshot(key, payload, nowMs) {
    if (payload.mode === "full") {
      let snap = snapshots.get(key);
      if (payload.batchIndex === 0) {
        snap = {
          rows: new Map(),
          batchId: payload.batchId,
          batchCount: payload.batchCount,
          received: new Set(),
          updatedAt: nowMs,
        };
        snapshots.set(key, snap);
      } else if (!snap || snap.batchId !== payload.batchId) {
        return false;
      }
      for (const r of payload.rows) snap.rows.set(r.rowNumber, r.values);
      snap.received.add(payload.batchIndex);
      snap.updatedAt = nowMs;
      return true;
    }
    const snap = snapshots.get(key);
    // Lần gửi cả tab bị đứt giữa chừng (Apps Script dừng khi một lô lỗi) → bản chụp thiếu, xin lại cả tab.
    if (!snap || snap.received.size < snap.batchCount) return false;
    for (const r of payload.rows) snap.rows.set(r.rowNumber, r.values);
    snap.updatedAt = nowMs;
    return true;
  }

  async function handle(req, res) {
    const started = now();
    const secret = getSecret();
    if (!secret) {
      res.status(503).json({ error: "Webhook Sheet đang tắt (thiếu SHEET_WEBHOOK_SECRET).", code: "SHEET_WEBHOOK_DISABLED" });
      return;
    }
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (contentLength > WEBHOOK_MAX_BODY_BYTES) {
      res.status(413).json({ error: "Body vượt 256 KB." });
      return;
    }
    if (!sheetSecretMatches(String(req.headers["x-sheet-secret"] ?? ""), secret)) {
      res.status(401).json({ error: "Sai hoặc thiếu X-Sheet-Secret.", code: "SHEET_WEBHOOK_UNAUTHORIZED" });
      return;
    }
    if (!contentLength && JSON.stringify(req.body ?? null).length > WEBHOOK_MAX_BODY_BYTES) {
      res.status(413).json({ error: "Body vượt 256 KB." });
      return;
    }

    const checked = validateWebhookBody(req.body, getSpreadsheetId());
    if (!checked.ok) {
      res.status(400).json({ error: checked.error });
      return;
    }
    const payload = checked.value;
    const nowMs = now();
    sweep(nowMs);

    const sessionDate = inferSessionDateFromTab(payload.tabName, nowMs);
    if (!sessionDate) {
      res.json({ ok: true, ignored: "not_session_tab", applied: 0, skipped: [] });
      return;
    }

    const snapKey = `${payload.sheetId}:${payload.gid || payload.tabName.toUpperCase()}`;
    if (!mergeSnapshot(snapKey, payload, nowMs)) {
      res.json({ ok: true, sessionDate, needFullTab: true, applied: 0, skipped: [] });
      return;
    }

    const freshRows = payload.rows.filter((r) => {
      const at = recentRows.get(`${snapKey}|${r.rowNumber}|${rowHash(r.values)}`);
      return at == null || nowMs - at > DEDUP_WINDOW_MS;
    });
    if (!freshRows.length) {
      res.json({ ok: true, sessionDate, deduped: payload.rows.length, applied: 0, skipped: [] });
      return;
    }

    const parsed = assignSheetSttByWarehouse(
      parseBookHangNgayGrid(snapshotToGrid(snapshots.get(snapKey)), sessionDate)
    );
    const wantRowNumbers = new Set(freshRows.map((r) => r.rowNumber));
    /** @type {number[]} */
    const indices = [];
    /** @type {{ rowNumber: number, awb: string, reason: string, code: string }[]} */
    const skipped = [];
    parsed.forEach((row, i) => {
      if (!wantRowNumbers.has(row.sheetRowIndex)) return;
      if (!isValidAwb(row.awb)) {
        skipped.push({
          rowNumber: row.sheetRowIndex,
          awb: row.awb,
          code: "awb_incomplete",
          reason: "AWB chưa đủ 11 số — chờ nhập xong",
        });
        return;
      }
      indices.push(i);
    });

    let result;
    try {
      result = indices.length
        ? await applyParsedSheetRows({
            parsed,
            indices,
            sessionDate,
            removeIds: [],
            wantReorder: false,
            io: deps.io,
            webhookAt: nowMs,
          })
        : null;
    } catch (e) {
      console.error(`[sheets/webhook] tab=«${payload.tabName}» lỗi ghi:`, e?.message ?? e);
      res.status(500).json({ error: String(e?.message ?? e) });
      return;
    }

    for (const r of freshRows) {
      recentRows.set(`${snapKey}|${r.rowNumber}|${rowHash(r.values)}`, nowMs);
    }

    for (const s of result?.skipped ?? []) {
      skipped.push({ rowNumber: s.sheetRowIndex, awb: s.awb, code: sheetSkipCode(s.code), reason: s.reason });
    }
    const added = result?.applied.length ?? 0;
    const updated = result?.updated.length ?? 0;
    const errorCount = result?.errors.length ?? 0;

    recordSheetSync(deps.io, {
      source: "webhook",
      sessionDate,
      tabName: payload.tabName,
      added,
      updated,
      mutated: Boolean(result?.mutated),
      skipped,
      now,
    });

    console.info(
      `[sheets/webhook] tab=«${payload.tabName}» mode=${payload.mode} rows=${payload.rows.length}` +
        ` added=${added} updated=${updated} skipped=${skipped.length} errors=${errorCount} ${now() - started}ms`
    );

    res.json({
      ok: true,
      sessionDate,
      applied: added + updated,
      added,
      updated,
      errorCount,
      skipped: skipped.map(({ rowNumber, reason, code }) => ({ rowNumber, reason, code })),
    });
  }

  return {
    rateLimit,
    handle: (req, res) => {
      handle(req, res).catch((e) => {
        console.error("[sheets/webhook]", e?.message ?? e);
        if (!res.headersSent) res.status(500).json({ error: "Webhook Sheet lỗi." });
      });
    },
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ io?: import('socket.io').Server, requireAuth: import('express').RequestHandler }} deps
 */
export function registerSheetWebhookRoutes(app, deps) {
  const webhook = createSheetWebhookHandler({ io: deps.io });
  const disabledGate = (_req, res, next) => {
    if (!String(process.env.SHEET_WEBHOOK_SECRET ?? "").trim()) {
      res.status(503).json({ error: "Webhook Sheet đang tắt (thiếu SHEET_WEBHOOK_SECRET).", code: "SHEET_WEBHOOK_DISABLED" });
      return;
    }
    next();
  };
  app.post("/api/sheets/book/webhook", disabledGate, webhook.rateLimit, webhook.handle);

  app.get("/api/sheets/book/realtime-status", deps.requireAuth, (_req, res) => {
    const auto = autoSyncConfigFromEnv();
    res.json({
      last: getLastSheetSync(),
      webhookEnabled: Boolean(String(process.env.SHEET_WEBHOOK_SECRET ?? "").trim()),
      autoSync: { enabled: auto.enabled, minutes: auto.minutes },
    });
  });
}
