import type { Shipment } from "../types/shipment";

/** Lọc lô đúng ngày phiên `YYYY-MM-DD` (trim hai phía — tránh lệch TCS/SCSC do khoảng trắng). */
export function filterShipmentsBySessionYmd(rows: readonly Shipment[], sessionYmd: string): Shipment[] {
  const key = sessionYmd.trim();
  return rows.filter((r) => (r.sessionDate || "").trim() === key);
}

/**
 * Lọc lô theo khoảng ngày phiên inclusive (YYYY-MM-DD, so sánh chuỗi — lịch ISO).
 * Nếu from > to thì đảo lại.
 */
export function filterShipmentsBySessionYmdRange(
  rows: readonly Shipment[],
  fromYmd: string,
  toYmd: string
): Shipment[] {
  let from = fromYmd.trim();
  let to = toYmd.trim();
  if (!from || !to) return [];
  if (from > to) [from, to] = [to, from];
  return rows.filter((r) => {
    const d = (r.sessionDate || "").trim();
    return d >= from && d <= to;
  });
}
