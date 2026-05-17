import type { ScscFieldOverride } from "../printTypes";
import type { ScscFieldDef } from "./scscWeighTemplate";
import { roundScscMm } from "./scscFieldOverrides";

export type ScscFieldFontUnit = "mm" | "pt";

export type ScscFieldFontSpec = {
  unit: ScscFieldFontUnit;
  value: number;
};

const FONT_MM_STEP = 0.5;
const FONT_PT_STEP = 0.5;

export function readScscFieldFont(def: ScscFieldDef): ScscFieldFontSpec {
  if (def.fontMm != null) {
    return { unit: "mm", value: def.fontMm };
  }
  return { unit: "pt", value: def.fontPt ?? 8.5 };
}

export function scscFieldUsesFontMm(def: ScscFieldDef): boolean {
  return def.fontMm != null || def.fontPt == null;
}

export function nudgeScscFieldFontPatch(
  def: ScscFieldDef,
  delta: number
): Pick<ScscFieldOverride, "fontMm" | "fontPt"> {
  const { unit, value } = readScscFieldFont(def);
  if (unit === "mm") {
    return { fontMm: roundScscMm(value + delta * FONT_MM_STEP) };
  }
  return { fontPt: roundScscPt(value + delta * FONT_PT_STEP) };
}

export function setScscFieldFontPatch(
  unit: ScscFieldFontUnit,
  value: number
): Pick<ScscFieldOverride, "fontMm" | "fontPt"> {
  if (unit === "mm") {
    return { fontMm: roundScscMm(value) };
  }
  return { fontPt: roundScscPt(value) };
}

export function roundScscPt(n: number): number {
  return Math.round(n * 2) / 2;
}
