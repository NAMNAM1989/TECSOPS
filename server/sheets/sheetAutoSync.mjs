/**
 * Đồng bộ dự phòng: định kỳ đọc lại tab hôm nay + ngày kế (giờ VN) qua gviz và áp như nút
 * Đồng bộ — bắt các lần webhook Apps Script bị lỡ. Bật bằng SHEET_AUTO_SYNC=1.
 */

import { getBookSpreadsheetId } from "./googleSheetFetch.mjs";
import { parseBookHangNgayGrid } from "./bookHangNgayParser.mjs";
import { assignSheetSttByWarehouse, isValidAwb } from "./sheetRowReconcile.mjs";
import { applyParsedSheetRows, loadBookGridForSession, sheetSkipCode } from "./sheetApply.mjs";
import { recordSheetSync } from "./sheetRealtimeStatus.mjs";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MINUTES = 3;
/** gviz có thể trễ vài phút so với Sheet — không ghi đè AWB webhook đã cập nhật trong khoảng này. */
const WEBHOOK_QUIET_MS = 10 * 60 * 1000;

export function autoSyncConfigFromEnv(env = process.env) {
  const enabled = String(env.SHEET_AUTO_SYNC ?? "").trim() === "1";
  const raw = Number(env.SHEET_AUTO_SYNC_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 1 && raw <= 120 ? raw : DEFAULT_MINUTES;
  return { enabled, minutes };
}

/** [hôm nay, ngày mai] theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
export function vnTodayAndTomorrow(nowMs = Date.now()) {
  const today = new Date(nowMs + VN_OFFSET_MS).toISOString().slice(0, 10);
  const tomorrow = new Date(nowMs + VN_OFFSET_MS + DAY_MS).toISOString().slice(0, 10);
  return [today, tomorrow];
}

function defaultLoadGrid(sessionDate) {
  return loadBookGridForSession(getBookSpreadsheetId(), sessionDate, "", true, "");
}

let running = false;

export function isSheetAutoSyncRunning() {
  return running;
}

/**
 * Một vòng auto-sync. Bỏ qua nếu vòng trước chưa xong; phần đọc-ghi state xếp hàng
 * sau webhook / apply tay qua `withSheetApplyLock` trong `applyParsedSheetRows`.
 * @param {{
 *   io?: import('socket.io').Server,
 *   loadGrid?: (sessionDate: string) => Promise<{ grid: object[], sheetTab: string }>,
 *   now?: () => number,
 * }} deps
 */
export async function runSheetAutoSyncOnce(deps = {}) {
  if (running) return { skipped: "already_running", sessions: [] };
  running = true;
  const loadGrid = deps.loadGrid ?? defaultLoadGrid;
  const now = deps.now ?? Date.now;
  const sessions = [];
  try {
    for (const sessionDate of vnTodayAndTomorrow(now())) {
      // Mốc lấy TRƯỚC khi tải lưới: webhook ghi trong lúc tải vẫn được giữ.
      const skipWebhookSince = now() - WEBHOOK_QUIET_MS;
      let loaded;
      try {
        loaded = await loadGrid(sessionDate);
      } catch (e) {
        sessions.push({ sessionDate, error: String(e?.message ?? e).slice(0, 200) });
        continue;
      }
      const parsed = assignSheetSttByWarehouse(parseBookHangNgayGrid(loaded.grid, sessionDate));
      const indices = [];
      parsed.forEach((row, i) => {
        if (isValidAwb(row.awb)) indices.push(i);
      });
      if (!indices.length) {
        sessions.push({ sessionDate, added: 0, updated: 0, mutated: false });
        continue;
      }
      const result = await applyParsedSheetRows({
        parsed,
        indices,
        sessionDate,
        removeIds: [],
        wantReorder: false,
        io: deps.io,
        skipWebhookSince,
      });
      const skipped = result.skipped.map((s) => ({
        awb: s.awb,
        code: sheetSkipCode(s.code),
        reason: s.reason,
        rowNumber: s.sheetRowIndex,
      }));
      recordSheetSync(deps.io, {
        source: "auto",
        sessionDate,
        tabName: loaded.sheetTab,
        added: result.applied.length,
        updated: result.updated.length,
        mutated: result.mutated,
        skipped,
        now,
      });
      sessions.push({
        sessionDate,
        added: result.applied.length,
        updated: result.updated.length,
        mutated: result.mutated,
      });
    }
  } finally {
    running = false;
  }
  return { sessions };
}

/**
 * @param {{ io?: import('socket.io').Server, env?: NodeJS.ProcessEnv }} deps
 * @returns {() => void} dừng timer
 */
export function startSheetAutoSync(deps = {}) {
  const { enabled, minutes } = autoSyncConfigFromEnv(deps.env ?? process.env);
  if (!enabled) return () => {};
  const tick = async () => {
    try {
      const { sessions = [] } = await runSheetAutoSyncOnce({ io: deps.io });
      const changed = sessions.filter((s) => s.mutated);
      for (const s of changed) {
        console.info(`[sheets/auto-sync] ${s.sessionDate} added=${s.added} updated=${s.updated}`);
      }
      // Tab ngày mai thường chưa được tạo — không cảnh báo mỗi vòng.
      for (const s of sessions.filter((x) => x.error && !x.error.startsWith("Không có tab Sheet"))) {
        console.warn(`[sheets/auto-sync] ${s.sessionDate}: ${s.error}`);
      }
    } catch (e) {
      console.error("[sheets/auto-sync]", e?.message ?? e);
    }
  };
  const timer = setInterval(() => void tick(), minutes * 60 * 1000);
  timer.unref?.();
  console.info(`[sheets/auto-sync] bật — mỗi ${minutes} phút (tab hôm nay + ngày mai, giờ VN)`);
  return () => clearInterval(timer);
}
