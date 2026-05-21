/** Chuyển đổi mm ↔ pt ↔ px cho editor & PDF (A4 210×297 mm). */

export const MM_TO_PT = 72 / 25.4;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function ptToMm(pt: number): number {
  return pt / MM_TO_PT;
}

/** px trên canvas editor → mm (theo chiều rộng A4 hiển thị). */
export function pxToMm(px: number, canvasWidthPx: number, pageWidthMm = A4_WIDTH_MM): number {
  if (canvasWidthPx <= 0) return 0;
  return (px / canvasWidthPx) * pageWidthMm;
}

export function mmToPx(mm: number, canvasWidthPx: number, pageWidthMm = A4_WIDTH_MM): number {
  if (pageWidthMm <= 0) return 0;
  return (mm / pageWidthMm) * canvasWidthPx;
}

/** Bước nudge editor (mm). */
export const PRINT_NUDGE_MM = 0.5;
