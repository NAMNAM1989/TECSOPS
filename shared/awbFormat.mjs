/**
 * Format AWB dùng chung server + client.
 * Nguồn sự thật — không nhân bản ở src/utils hay server/sheets.
 */

export function awbDigitsKey(awb) {
  return String(awb ?? "").replace(/\D/g, "");
}

/** Alias rõ nghĩa khi so trùng / cắt chuỗi AWB */
export function rawAwbDigits(formatted) {
  return awbDigitsKey(formatted);
}

/**
 * Format 11 chữ số → XXX-XXXX XXXX
 * VD: 78420042005 → 784-2004 2005
 */
export function formatAwb(raw) {
  const digits = awbDigitsKey(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)} ${digits.slice(7)}`;
}

/**
 * Format AWB trên tem in — bỏ khoảng giữa nhóm 4+4 để rút độ dài chuỗi,
 * giúp fitAwbFontMm phóng to hơn (VD: 695-56301136 thay vì 695-5630 1136).
 */
export function formatAwbLabel(raw) {
  const digits = awbDigitsKey(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}
