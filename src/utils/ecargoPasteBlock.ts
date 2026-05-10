import type { Shipment } from "../types/shipment";

/** Chỉ giữ chữ số AWB (VD 978-2556 2555 → 97825562555). */
export function compactAwbDigitsForEcargoPaste(awb: string): string {
  return (awb ?? "").replace(/\D/g, "");
}

/**
 * Chuẩn hoá mã chuyến: phần số tối thiểu 3 chữ số (VJ85 → VJ085).
 * Không khớp pattern thì trả chuỗi đã trim + upper.
 */
export function formatFlightForEcargoPaste(flight: string): string {
  const t = (flight ?? "").trim().toUpperCase();
  const m = t.match(/^([A-Z]{1,3})(\d+)$/);
  if (m) return m[1] + m[2].padStart(3, "0");
  return t;
}

/** Khối 5 dòng dán eCargo / hệ thống ngoài (số xe lấy từ ô đã nhập). */
export function buildKhoScscEcargoPasteBlock(
  row: Pick<Shipment, "flight" | "flightDate" | "dest" | "awb">,
  vehicleRaw: string
): string {
  const vehicle = vehicleRaw.trim().toUpperCase();
  const lines = [
    vehicle,
    formatFlightForEcargoPaste(row.flight),
    (row.flightDate ?? "").trim().toUpperCase(),
    (row.dest ?? "").trim().toUpperCase(),
    compactAwbDigitsForEcargoPaste(row.awb),
  ];
  return lines.join("\n");
}
