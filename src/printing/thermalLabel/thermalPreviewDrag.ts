import { roundThermalMm } from "./thermalFieldOverrides";

export function pointerDeltaToLabelMm(
  dxPx: number,
  dyPx: number,
  pageRect: DOMRect,
  labelWidthMm: number,
  labelHeightMm: number,
  viewScale: number
): { dxMm: number; dyMm: number } {
  const dxMm = (dxPx / pageRect.width) * labelWidthMm / viewScale;
  const dyMm = (dyPx / pageRect.height) * labelHeightMm / viewScale;
  return { dxMm: roundThermalMm(dxMm), dyMm: roundThermalMm(dyMm) };
}
