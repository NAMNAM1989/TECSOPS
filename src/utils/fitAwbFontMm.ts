/**
 * Cỡ chữ AWB vừa khít tem (không bao giờ cắt "...").
 * Courier ~0.60em/ký tự; chừa lề trong cho XP-470B (~2.5mm mỗi bên).
 */
export function fitAwbFontMm(mawb: string, opts?: { compact?: boolean; relScale?: number }): number {
  const compact = opts?.compact ?? false;
  const rel = opts?.relScale ?? 1;
  const text = (mawb || "").trim() || "000-0000 0000";
  const usableMm = compact ? 93 : 94;
  const charFactor = 0.6;
  const fitted = usableMm / (Math.max(text.length, 1) * charFactor);
  const maxMm = compact ? 9.5 : 12.5;
  const minMm = compact ? 6.8 : 9;
  const base = Math.min(maxMm, Math.max(minMm, fitted));
  return Math.round(base * rel * 100) / 100;
}
