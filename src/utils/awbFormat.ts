/**
 * Format 11 chữ số thành dạng AWB chuẩn: XXX-XXXX XXXX
 * VD: 78420042005 → 784-2004 2005
 */
export function formatAwb(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)} ${digits.slice(7)}`;
}

/** Lấy phần chữ số thuần từ AWB đã format hoặc bất kỳ chuỗi nào */
export function rawAwbDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/** Alias rõ nghĩa khi so trùng AWB */
export function awbDigitsKey(awb: string): string {
  return rawAwbDigits(awb);
}
