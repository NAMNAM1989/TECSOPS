import { roundScscMm } from "./scscFieldOverrides";

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

/** Đổi delta pixel trên preview → delta mm trong hệ layout (trước offset/scale profile). */
export function pointerDeltaToLayoutMm(
  dxPx: number,
  dyPx: number,
  pageRect: DOMRect,
  scaleX: number,
  scaleY: number
): { dxMm: number; dyMm: number } {
  const dxMm = (dxPx / pageRect.width) * PAGE_W_MM / scaleX;
  const dyMm = (dyPx / pageRect.height) * PAGE_H_MM / scaleY;
  return { dxMm: roundScscMm(dxMm), dyMm: roundScscMm(dyMm) };
}
