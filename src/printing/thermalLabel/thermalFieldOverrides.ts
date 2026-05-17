import type { ThermalFieldOverride, ThermalFieldOverridesMap } from "../printTypes";
import type { ThermalLabelFieldDef } from "./thermalLabelFieldCatalog";

const LIMITS = {
  x: { min: 0, max: 100 },
  y: { min: 0, max: 80 },
  fontMm: { min: 1.5, max: 28 },
  mul: { min: 1, max: 4 },
  keys: 32,
} as const;

export function roundThermalMm(n: number): number {
  return Math.round(n * 2) / 2;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeThermalFieldOverrideLoose(raw: unknown): ThermalFieldOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: ThermalFieldOverride = {};
  const x = typeof o.x === "number" ? roundThermalMm(clamp(o.x, LIMITS.x.min, LIMITS.x.max)) : undefined;
  const y = typeof o.y === "number" ? roundThermalMm(clamp(o.y, LIMITS.y.min, LIMITS.y.max)) : undefined;
  const fontMm =
    typeof o.fontMm === "number" ? roundThermalMm(clamp(o.fontMm, LIMITS.fontMm.min, LIMITS.fontMm.max)) : undefined;
  const mulX =
    typeof o.mulX === "number" ? roundThermalMm(clamp(o.mulX, LIMITS.mul.min, LIMITS.mul.max)) : undefined;
  const mulY =
    typeof o.mulY === "number" ? roundThermalMm(clamp(o.mulY, LIMITS.mul.min, LIMITS.mul.max)) : undefined;
  const tsplFont = String(o.tsplFont ?? "")
    .trim()
    .slice(0, 2);
  if (x != null) out.x = x;
  if (y != null) out.y = y;
  if (fontMm != null) out.fontMm = fontMm;
  if (mulX != null) out.mulX = mulX;
  if (mulY != null) out.mulY = mulY;
  if (tsplFont) out.tsplFont = tsplFont;
  return Object.keys(out).length ? out : null;
}

export function normalizeThermalFieldOverridesMapLoose(raw: unknown): ThermalFieldOverridesMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: ThermalFieldOverridesMap = {};
  let count = 0;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= LIMITS.keys) break;
    const k = String(key).slice(0, 48);
    const entry = normalizeThermalFieldOverrideLoose(val);
    if (!entry) continue;
    out[k] = entry;
    count += 1;
  }
  return Object.keys(out).length ? out : undefined;
}

export function applyThermalFieldOverride(
  def: ThermalLabelFieldDef,
  patch?: ThermalFieldOverride | null
): ThermalLabelFieldDef {
  if (!patch) return def;
  return {
    ...def,
    x: patch.x ?? def.x,
    y: patch.y ?? def.y,
    fontMm: patch.fontMm ?? def.fontMm,
    mulX: patch.mulX ?? def.mulX,
    mulY: patch.mulY ?? def.mulY,
    tsplFont: patch.tsplFont ?? def.tsplFont,
  };
}

export function applyThermalFieldOverrides(
  fields: ThermalLabelFieldDef[],
  overrides?: ThermalFieldOverridesMap | null
): ThermalLabelFieldDef[] {
  if (!overrides || !Object.keys(overrides).length) return fields;
  return fields.map((def) => applyThermalFieldOverride(def, overrides[def.key]));
}

export function mergeThermalFieldOverrides(
  base?: ThermalFieldOverridesMap | null,
  patch?: ThermalFieldOverridesMap | null
): ThermalFieldOverridesMap | undefined {
  const merged: ThermalFieldOverridesMap = { ...(base ?? {}) };
  if (patch) {
    for (const [key, val] of Object.entries(patch)) {
      merged[key] = { ...merged[key], ...val };
    }
  }
  return pruneThermalFieldOverrides(merged);
}

export function pruneThermalFieldOverrides(map: ThermalFieldOverridesMap): ThermalFieldOverridesMap | undefined {
  const out: ThermalFieldOverridesMap = {};
  for (const [key, val] of Object.entries(map)) {
    const cleaned = normalizeThermalFieldOverrideLoose(val);
    if (cleaned) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : undefined;
}

export function removeThermalFieldOverride(
  map: ThermalFieldOverridesMap | undefined,
  fieldKey: string
): ThermalFieldOverridesMap | undefined {
  if (!map) return undefined;
  const next = { ...map };
  delete next[fieldKey];
  return pruneThermalFieldOverrides(next);
}

export function thermalFieldOverridesEqual(
  a?: ThermalFieldOverridesMap | null,
  b?: ThermalFieldOverridesMap | null
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

/** Profile đã lưu ít nhất một ô căn chỉnh tay (preview/in dùng layout mm). */
export function hasThermalFieldCalibration(
  overrides?: ThermalFieldOverridesMap | null
): boolean {
  return Boolean(overrides && Object.keys(overrides).length > 0);
}
