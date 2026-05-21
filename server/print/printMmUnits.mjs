/** 1 mm → PDF points (1 pt = 1/72 inch). */
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm) {
  return Number(mm) * MM_TO_PT;
}

export function ptToMm(pt) {
  return Number(pt) / MM_TO_PT;
}

/** font size mm (CSS-like on A4) → PDF pt — same ratio as layout mm. */
export function mmFontToPt(fontMm) {
  return mmToPt(fontMm);
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
