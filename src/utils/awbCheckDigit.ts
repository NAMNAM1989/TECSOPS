import { rawAwbDigits } from "./awbFormat";

/** Lý do AWB không hợp lệ (11 số, chữ số cuối = số thứ 4–10 mod 7), hoặc null khi hợp lệ. */
export function awbCheckDigitError(awb: string): string | null {
  const d = rawAwbDigits(awb);
  if (d.length !== 11) return "AWB phải có 11 số";
  const want = Number(d.slice(3, 10)) % 7;
  if (Number(d[10]) !== want) return `AWB sai số kiểm tra (chữ số cuối phải là ${want})`;
  return null;
}
