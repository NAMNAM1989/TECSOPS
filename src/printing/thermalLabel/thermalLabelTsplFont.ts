import type { ThermalLabelFieldDef } from "./thermalLabelFieldCatalog";

function clampMul(n: number): number {
  return Math.max(1, Math.min(4, Math.round(n)));
}

/** Quy đổi fontMm (sau override) sang hệ số nhân TSPL so với mặc định catalog. */
export function thermalDefToTsplMul(
  def: ThermalLabelFieldDef,
  catalogDef: ThermalLabelFieldDef
): { mulX: number; mulY: number } {
  const baseMm = catalogDef.fontMm > 0 ? catalogDef.fontMm : def.fontMm;
  const scale = baseMm > 0 ? def.fontMm / baseMm : 1;
  return {
    mulX: clampMul(def.mulX * scale),
    mulY: clampMul(def.mulY * scale),
  };
}
