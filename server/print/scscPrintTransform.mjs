/**
 * Khớp `applyScscPrintTransformToBounds` (scscFieldCoords.ts) và CSS preview:
 * translate(offset) scale(s) origin top-left → x' = offsetX + x * scaleX
 */

/**
 * @param {{ x: number; y: number; width: number; height?: number | null; lineHeight?: number | null }} box
 * @param {{ offsetXmm?: number; offsetYMm?: number; scaleX?: number; scaleY?: number }} t
 */
export function applyScscPrintTransformBox(box, t = {}) {
  const ox = Number(t.offsetXmm ?? t.offsetXMm ?? 0);
  const oy = Number(t.offsetYmm ?? t.offsetYMm ?? 0);
  const sx = Number(t.scaleX ?? 1);
  const sy = Number(t.scaleY ?? 1);
  const fontScale = (sx + sy) / 2;
  return {
    xMm: ox + box.x * sx,
    yMm: oy + box.y * sy,
    widthMm: box.width * sx,
    heightMm: box.height != null ? box.height * sy : null,
    lineHeightMm: box.lineHeight != null ? box.lineHeight * sy : null,
    fontScale,
  };
}
