/**
 * Cỡ chữ AWB vừa khít tem (không bao giờ cắt "...").
 * Mẫu mới: standard ~28.5pt (10mm), compact ~22pt (7.8mm).
 */
export function fitAwbFontMm(mawb: string, opts?: { compact?: boolean; relScale?: number }): number {
  const compact = opts?.compact ?? false;
  const rel = opts?.relScale ?? 1;
  const text = (mawb || "").trim() || "000-00000000";
  const usableMm = compact ? 92 : 93;
  const charFactor = 0.52;
  const fitted = usableMm / (Math.max(text.length, 1) * charFactor);
  const maxMm = compact ? 7.8 : 10.05;
  const minMm = compact ? 5.5 : 7;
  const base = Math.min(maxMm, Math.max(minMm, fitted));
  return Math.round(base * rel * 100) / 100;
}
