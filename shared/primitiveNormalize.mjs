/** Helpers chuẩn hóa số/chuỗi — dùng chung printer profile normalize. */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function str(v, max = 120) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function num(v, fallback, min, max) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}
