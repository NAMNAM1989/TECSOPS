import type { Shipment } from "../types/shipment";

/** Lọc lô đúng ngày phiên `YYYY-MM-DD` (trim hai phía — tránh lệch TCS/SCSC do khoảng trắng). */
export function filterShipmentsBySessionYmd(rows: readonly Shipment[], sessionYmd: string): Shipment[] {
  const key = sessionYmd.trim();
  return rows.filter((r) => (r.sessionDate || "").trim() === key);
}
