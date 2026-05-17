import type { ThermalFieldOverride } from "../printTypes";
import type { ThermalLabelFieldDef } from "./thermalLabelFieldCatalog";
import { roundThermalMm } from "./thermalFieldOverrides";

const FONT_MM_STEP = 0.5;

export function nudgeThermalFieldFontPatch(
  def: ThermalLabelFieldDef,
  delta: number
): Pick<ThermalFieldOverride, "fontMm"> {
  return {
    fontMm: roundThermalMm(Math.max(1.5, Math.min(28, def.fontMm + delta * FONT_MM_STEP))),
  };
}
