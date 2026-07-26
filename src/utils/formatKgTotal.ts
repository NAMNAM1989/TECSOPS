/**
 * Format tổng kg trên UI ops — giữ phần thập phân (tối đa 3),
 * không rút gọn "36.9k", không làm tròn về số nguyên.
 */
export function formatKgTotal(kg: number): string {
  if (!Number.isFinite(kg)) return "0";
  // Chỉ làm sạch nhiễu binary float ở mức 0.001 kg — không làm tròn số liệu nghiệp vụ.
  const n = Math.round((kg + Number.EPSILON) * 1000) / 1000;
  return n.toLocaleString("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
    useGrouping: true,
  });
}
