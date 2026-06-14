/** Format 11 chữ số → XXX-XXXX XXXX (khớp src/utils/awbFormat.ts). */
export function formatAwb(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)} ${digits.slice(7)}`;
}

export function awbDigitsKey(awb) {
  return String(awb ?? "").replace(/\D/g, "");
}
