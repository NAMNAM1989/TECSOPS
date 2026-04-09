const KEY = "tecsops-label-font-scale";

export const LABEL_FONT_SCALE_MIN = 0.5;
export const LABEL_FONT_SCALE_MAX = 1.35;
export const LABEL_FONT_SCALE_DEFAULT = 1;

export function clampLabelFontScale(n: number): number {
  return Math.min(LABEL_FONT_SCALE_MAX, Math.max(LABEL_FONT_SCALE_MIN, n));
}

export function loadLabelFontScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? "");
    if (Number.isFinite(v)) return clampLabelFontScale(v);
  } catch {
    /* ignore */
  }
  return LABEL_FONT_SCALE_DEFAULT;
}

export function saveLabelFontScale(n: number): void {
  try {
    localStorage.setItem(KEY, String(clampLabelFontScale(n)));
  } catch {
    /* ignore */
  }
}

/** Quy đổi cỡ gốc (pt) × tỷ lệ người dùng → chuỗi dùng cho style */
export function labelFs(scale: number, pt: number): string {
  const v = Math.round(pt * clampLabelFontScale(scale) * 10) / 10;
  return `${v}pt`;
}
