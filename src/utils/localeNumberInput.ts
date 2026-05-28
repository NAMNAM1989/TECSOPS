/** Parse số từ chuỗi người dùng — hỗ trợ `0,98` (vi) và `0.98` (en). */
export function parseLocaleNumber(raw: string): number | null {
  let t = String(raw ?? "").trim().replace(/\s/g, "");
  if (!t || t === "-" || t === "," || t === ".") return null;

  const commaCount = (t.match(/,/g) ?? []).length;
  const dotCount = (t.match(/\./g) ?? []).length;

  if (commaCount > 0 && dotCount > 0) {
    const lastComma = t.lastIndexOf(",");
    const lastDot = t.lastIndexOf(".");
    if (lastComma > lastDot) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (commaCount === 1) {
    const frac = t.split(",")[1] ?? "";
    if (frac.length <= 3) {
      t = t.replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (commaCount > 1) {
    t = t.replace(/,/g, "");
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseLocaleInteger(raw: string): number | null {
  const n = parseLocaleNumber(raw);
  if (n == null) return null;
  return Math.round(n);
}

/** Hiển thị trong ô nhập (dùng dấu phẩy thập phân cho quen vi-VN). */
export function formatDecimalInput(value: number, maxDecimals = 4): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(maxDecimals));
  if (rounded === 0) return "0";
  return String(rounded).replace(".", ",");
}

export function formatIntegerInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value));
}
