const KEY_MAWB = "tecsops-label-mawb-rel-scale";
const KEY_HAWB = "tecsops-label-hawb-rel-scale";

/** Tỷ lệ nhân cỡ chữ dòng MAWB/AWB (cơ sở 7mm trước fontScale toàn tem). */
export const LABEL_MAWB_REL_MIN = 0.75;
export const LABEL_MAWB_REL_MAX = 1.45;
/** Tỷ lệ nhân cỡ số HAWB (cơ sở 4mm). */
export const LABEL_HAWB_REL_MIN = 0.8;
export const LABEL_HAWB_REL_MAX = 1.85;

/** AWB/MAWB in to trên tem — mặc định 145%. */
const DEFAULT_MAWB_REL = 1.45;
/** HAWB in to trên tem 100×80 — mặc định 145% (cùng mức MAWB). */
const DEFAULT_HAWB_REL = 1.45;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampLabelMawbRelScale(n: number): number {
  return clamp(n, LABEL_MAWB_REL_MIN, LABEL_MAWB_REL_MAX);
}

export function clampLabelHawbRelScale(n: number): number {
  return clamp(n, LABEL_HAWB_REL_MIN, LABEL_HAWB_REL_MAX);
}

export function loadLabelMawbRelScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY_MAWB) ?? "");
    if (Number.isFinite(v)) return clampLabelMawbRelScale(v);
  } catch {
    /* ignore */
  }
  return DEFAULT_MAWB_REL;
}

export function saveLabelMawbRelScale(n: number): void {
  try {
    localStorage.setItem(KEY_MAWB, String(clampLabelMawbRelScale(n)));
  } catch {
    /* ignore */
  }
}

export function loadLabelHawbRelScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY_HAWB) ?? "");
    if (Number.isFinite(v)) return clampLabelHawbRelScale(v);
  } catch {
    /* ignore */
  }
  return DEFAULT_HAWB_REL;
}

export function saveLabelHawbRelScale(n: number): void {
  try {
    localStorage.setItem(KEY_HAWB, String(clampLabelHawbRelScale(n)));
  } catch {
    /* ignore */
  }
}
