/**
 * Cỡ chữ AWB vừa khít tem (không cắt "...", không tràn viền).
 * Mục tiêu: standard ~34.5pt (12.2mm), compact ~25.5pt (9mm).
 * Fit theo IBM Plex Mono + letter-spacing dương nhẹ (không ép âm — tránh nhòe nhiệt).
 */
export function fitAwbFontMm(mawb: string, opts?: { compact?: boolean; relScale?: number }): number {
  const compact = opts?.compact ?? false;
  const rel = opts?.relScale ?? 1;
  const text = (mawb || "").trim() || "000-00000000";
  /* 100mm − padding tem − viền − padding ô */
  const usableMm = compact ? 90 : 91;
  /* IBM Plex Mono rộng hơn Courier ép tracking âm */
  const charFactor = 0.62;
  const fitted = usableMm / (Math.max(text.length, 1) * charFactor);
  const maxMm = compact ? 9 : 12.2;
  const minMm = compact ? 6.2 : 8.2;
  const base = Math.min(maxMm, Math.max(minMm, fitted));
  return Math.round(base * rel * 100) / 100;
}

/**
 * Cỡ chữ ORIGIN/DEST (thường 3 ký tự IATA) — to, rõ, không tràn nửa ô.
 */
export function fitRouteCodeFontMm(
  code: string,
  opts?: { compact?: boolean; relScale?: number }
): number {
  const compact = opts?.compact ?? false;
  const rel = opts?.relScale ?? 1;
  const text = (code || "").trim() || "XXX";
  /* Nửa tem ≈ 46–47mm trừ padding/viền */
  const usableMm = compact ? 42 : 44;
  const charFactor = 0.72;
  const fitted = usableMm / (Math.max(text.length, 1) * charFactor);
  const maxMm = compact ? 6.2 : 8.2;
  const minMm = compact ? 4.4 : 5.8;
  const base = Math.min(maxMm, Math.max(minMm, fitted));
  return Math.round(base * rel * 100) / 100;
}
