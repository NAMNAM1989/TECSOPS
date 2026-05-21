import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";

/** Lô khác đã dùng cùng 11 số AWB (bỏ qua format). */
export function findAwbDigitsConflict(
  rows: Shipment[],
  digits: string,
  exceptShipmentId?: string | null
): Shipment | null {
  if (digits.length !== 11) return null;
  for (const r of rows) {
    if (exceptShipmentId && r.id === exceptShipmentId) continue;
    if (awbDigitsKey(r.awb) === digits) return r;
  }
  return null;
}

/** True nếu đã có lô khác dùng cùng 11 số AWB (so sánh theo chữ số, bỏ qua format). */
export function isAwbDigitsTaken(
  rows: Shipment[],
  digits: string,
  exceptShipmentId?: string | null
): boolean {
  return findAwbDigitsConflict(rows, digits, exceptShipmentId) != null;
}

export function awbConflictMessage(conflict: Shipment): string {
  const when = conflict.sessionDate?.trim() || "không rõ ngày";
  return `AWB đã tồn tại ở phiên ${when} (${conflict.warehouse}, STT ${conflict.stt}). Xóa lô đó trước khi dùng lại số AWB này.`;
}
