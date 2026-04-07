import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";

/** True nếu đã có lô khác dùng cùng 11 số AWB (so sánh theo chữ số, bỏ qua format). */
export function isAwbDigitsTaken(
  rows: Shipment[],
  digits: string,
  exceptShipmentId?: string | null
): boolean {
  if (digits.length !== 11) return false;
  for (const r of rows) {
    if (exceptShipmentId && r.id === exceptShipmentId) continue;
    if (awbDigitsKey(r.awb) === digits) return true;
  }
  return false;
}
