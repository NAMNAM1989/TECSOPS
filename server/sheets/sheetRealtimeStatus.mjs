/**
 * Trạng thái đồng bộ Sheet realtime (webhook Apps Script / auto-sync) — in-memory, một replica.
 * Client nhận qua socket `sheetSync` và `GET /api/sheets/book/realtime-status`.
 */

export const SHEET_SYNC_SOCKET_EVENT = "sheetSync";

const CONFLICT_REPEAT_TTL_MS = 10 * 60 * 1000;
const MAX_CONFLICTS_PER_EVENT = 20;
const TOASTABLE_CODES = new Set(["awb_taken", "sheet_duplicate"]);

/** @type {null | { at: string, source: string, sessionDate: string, tabName: string, added: number, updated: number }} */
let lastSync = null;

/** @type {Map<string, number>} key conflict → hết hạn (ms) */
const reportedConflicts = new Map();

export function getLastSheetSync() {
  return lastSync;
}

export function resetSheetRealtimeStatus() {
  lastSync = null;
  reportedConflicts.clear();
}

/**
 * Chỉ giữ conflict nên báo người dùng (AWB trùng / khác phiên), bỏ lặp trong 10 phút
 * để auto-sync 3 phút/lần không bắn lại toast cũ.
 * @param {{ awb: string, reason: string, code: string, rowNumber?: number | null }[]} skipped
 */
function freshConflicts(skipped, sessionDate, nowMs) {
  for (const [key, exp] of reportedConflicts) {
    if (exp <= nowMs) reportedConflicts.delete(key);
  }
  const out = [];
  for (const s of skipped) {
    if (!TOASTABLE_CODES.has(s.code)) continue;
    const key = `${sessionDate}|${s.code}|${s.awb}`;
    if (reportedConflicts.has(key)) continue;
    reportedConflicts.set(key, nowMs + CONFLICT_REPEAT_TTL_MS);
    out.push({ awb: s.awb, code: s.code, reason: s.reason, rowNumber: s.rowNumber ?? null });
    if (out.length >= MAX_CONFLICTS_PER_EVENT) break;
  }
  return out;
}

/**
 * Ghi nhận một lần áp Sheet tự động. Chỉ emit khi có thay đổi dữ liệu hoặc conflict mới.
 * @param {import('socket.io').Server | undefined} io
 * @param {{
 *   source: "webhook" | "auto",
 *   sessionDate: string,
 *   tabName: string,
 *   added: number,
 *   updated: number,
 *   mutated: boolean,
 *   skipped: { awb: string, reason: string, code: string, rowNumber?: number | null }[],
 *   now?: () => number,
 * }} info
 */
export function recordSheetSync(io, info) {
  const nowMs = (info.now ?? Date.now)();
  const conflicts = freshConflicts(info.skipped ?? [], info.sessionDate, nowMs);
  if (!info.mutated && !conflicts.length) return null;

  const event = {
    at: new Date(nowMs).toISOString(),
    source: info.source,
    sessionDate: info.sessionDate,
    tabName: info.tabName,
    added: info.added,
    updated: info.updated,
    conflicts,
  };
  if (info.mutated) {
    lastSync = {
      at: event.at,
      source: event.source,
      sessionDate: event.sessionDate,
      tabName: event.tabName,
      added: event.added,
      updated: event.updated,
    };
  }
  io?.emit(SHEET_SYNC_SOCKET_EVENT, { ...event, last: lastSync });
  return event;
}
