import { formatGroupedNumber } from "./formatNumber";

/**
 * Format tổng kg trên UI ops — giữ phần thập phân (tối đa 3),
 * không rút gọn "36.9k", không làm tròn về số nguyên.
 * Dấu hàng nghìn đi qua `formatGroupedNumber` (mặc định dấu phẩy).
 */
export function formatKgTotal(kg: number): string {
  if (!Number.isFinite(kg)) return "0";
  const n = Math.round((kg + Number.EPSILON) * 1000) / 1000;
  return formatGroupedNumber(n, { maxFractionDigits: 3, minFractionDigits: 0 });
}
