/**
 * Đặt lại thứ tự lô một phiên theo danh sách id — ngày khác giữ nguyên chỗ.
 * Tách khỏi Google Sheet import (đã gỡ A3); REORDER_SESSION vẫn dùng mutation này.
 */
export function applySessionIdOrder(rows, sessionDate, orderedIds) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const r of list) {
    if (r.sessionDate === sessionDate) byId.set(r.id, r);
  }
  const seen = new Set();
  /** @type {object[]} */
  const ordered = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || seen.has(id)) continue;
    ordered.push(r);
    seen.add(id);
  }
  for (const r of list) {
    if (r.sessionDate !== sessionDate || seen.has(r.id)) continue;
    ordered.push(r);
    seen.add(r.id);
  }
  const out = [];
  let inserted = false;
  for (const r of list) {
    if (r.sessionDate !== sessionDate) {
      out.push(r);
      continue;
    }
    if (!inserted) {
      out.push(...ordered);
      inserted = true;
    }
  }
  if (!inserted) out.push(...ordered);
  return out;
}
