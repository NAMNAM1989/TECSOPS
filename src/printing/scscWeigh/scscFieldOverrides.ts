import type { ScscFieldOverride, ScscFieldOverridesMap } from "../printTypes";
import type { ScscFieldDef } from "./scscWeighTemplate";

const LIMITS = {
  x: { min: 0, max: 205 },
  y: { min: 0, max: 292 },
  width: { min: 4, max: 195 },
  heightMm: { min: 2, max: 80 },
  fontMm: { min: 1.5, max: 12 },
  fontPt: { min: 5, max: 24 },
  lineHeightMm: { min: 2, max: 20 },
  keys: 48,
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function roundScscMm(n: number): number {
  return Math.round(n * 2) / 2;
}

function roundScscPt(n: number): number {
  return Math.round(n * 2) / 2;
}

function clampOverridePart(
  key: "x" | "y" | "width" | "heightMm" | "fontMm" | "lineHeightMm",
  value: number | undefined
): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const lim = LIMITS[key];
  return roundScscMm(clamp(value, lim.min, lim.max));
}

function clampOverrideFontPt(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const lim = LIMITS.fontPt;
  return roundScscPt(clamp(value, lim.min, lim.max));
}

export function normalizeScscFieldOverrideLoose(raw: unknown): ScscFieldOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: ScscFieldOverride = {};
  const x = clampOverridePart("x", typeof o.x === "number" ? o.x : Number(o.x));
  const y = clampOverridePart("y", typeof o.y === "number" ? o.y : Number(o.y));
  const width = clampOverridePart("width", typeof o.width === "number" ? o.width : Number(o.width));
  const heightMm = clampOverridePart(
    "heightMm",
    typeof o.heightMm === "number" ? o.heightMm : Number(o.heightMm)
  );
  const fontMm = clampOverridePart("fontMm", typeof o.fontMm === "number" ? o.fontMm : Number(o.fontMm));
  const fontPt = clampOverrideFontPt(typeof o.fontPt === "number" ? o.fontPt : Number(o.fontPt));
  const lineHeightMm = clampOverridePart(
    "lineHeightMm",
    typeof o.lineHeightMm === "number" ? o.lineHeightMm : Number(o.lineHeightMm)
  );
  if (x != null) out.x = x;
  if (y != null) out.y = y;
  if (width != null) out.width = width;
  if (heightMm != null) out.heightMm = heightMm;
  if (fontMm != null) out.fontMm = fontMm;
  else if (fontPt != null) out.fontPt = fontPt;
  if (lineHeightMm != null) out.lineHeightMm = lineHeightMm;
  return Object.keys(out).length ? out : null;
}

export function normalizeScscFieldOverridesMapLoose(raw: unknown): ScscFieldOverridesMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: ScscFieldOverridesMap = {};
  let count = 0;
  for (const [key, val] of Object.entries(o)) {
    if (count >= LIMITS.keys) break;
    const k = String(key).slice(0, 48);
    if (!k) continue;
    const entry = normalizeScscFieldOverrideLoose(val);
    if (!entry) continue;
    out[k] = entry;
    count += 1;
  }
  return Object.keys(out).length ? out : undefined;
}

export function applyScscFieldOverride(def: ScscFieldDef, patch?: ScscFieldOverride | null): ScscFieldDef {
  if (!patch) return def;
  const next = { ...def };
  if (patch.x != null) next.x = patch.x;
  if (patch.y != null) next.y = patch.y;
  if (patch.width != null) next.width = patch.width;
  if (patch.heightMm != null) next.heightMm = patch.heightMm;
  if (patch.fontMm != null) {
    next.fontMm = patch.fontMm;
    delete next.fontPt;
  }
  if (patch.fontPt != null) {
    next.fontPt = patch.fontPt;
    delete next.fontMm;
  }
  if (patch.lineHeightMm != null) next.lineHeightMm = patch.lineHeightMm;
  return next;
}

export function applyScscFieldOverrides(
  fields: ScscFieldDef[],
  overrides?: ScscFieldOverridesMap | null
): ScscFieldDef[] {
  if (!overrides || !Object.keys(overrides).length) return fields;
  return fields.map((def) => applyScscFieldOverride(def, overrides[def.key]));
}

export function mergeScscFieldOverrides(
  base?: ScscFieldOverridesMap | null,
  patch?: ScscFieldOverridesMap | null
): ScscFieldOverridesMap | undefined {
  const merged: ScscFieldOverridesMap = { ...(base ?? {}) };
  if (patch) {
    for (const [key, val] of Object.entries(patch)) {
      const combined = { ...merged[key], ...val };
      if (val.fontMm != null) delete combined.fontPt;
      if (val.fontPt != null) delete combined.fontMm;
      merged[key] = combined;
    }
  }
  return pruneEmptyScscFieldOverrides(merged);
}

export function pruneEmptyScscFieldOverrides(map: ScscFieldOverridesMap): ScscFieldOverridesMap | undefined {
  const out: ScscFieldOverridesMap = {};
  for (const [key, val] of Object.entries(map)) {
    const cleaned = normalizeScscFieldOverrideLoose(val);
    if (cleaned) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : undefined;
}

export function removeScscFieldOverride(
  map: ScscFieldOverridesMap | undefined,
  fieldKey: string
): ScscFieldOverridesMap | undefined {
  if (!map) return undefined;
  const next = { ...map };
  delete next[fieldKey];
  return pruneEmptyScscFieldOverrides(next);
}

export function scscFieldOverridesEqual(
  a?: ScscFieldOverridesMap | null,
  b?: ScscFieldOverridesMap | null
): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}
