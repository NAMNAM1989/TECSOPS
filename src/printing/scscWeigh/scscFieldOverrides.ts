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

export const SCSC_FIELD_MM_LIMITS = {
  width: LIMITS.width,
  heightMm: LIMITS.heightMm,
  lineHeightMm: LIMITS.lineHeightMm,
} as const;

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
  const align = o.align;
  if (align === "left" || align === "center" || align === "right") out.align = align;
  if (o.wrapText === true) out.wrapText = true;
  if (o.wrapText === false) out.wrapText = false;
  if (o.multiline === true) out.multiline = true;
  if (o.multiline === false) out.multiline = false;
  if (o.bold === true) out.bold = true;
  if (o.bold === false) out.bold = false;
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
  if (patch.align != null) next.align = patch.align;
  if (patch.wrapText != null) next.wrapText = patch.wrapText;
  if (patch.multiline != null) next.multiline = patch.multiline;
  if (patch.bold != null) next.bold = patch.bold;
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

/** Chụp layout hiện tại trên preview (sau enrich) thành override đầy đủ. */
export function scscFieldDefToLayoutOverride(def: ScscFieldDef): ScscFieldOverride {
  const o: ScscFieldOverride = {
    x: roundScscMm(def.x),
    y: roundScscMm(def.y),
    width: roundScscMm(def.width),
  };
  if (def.heightMm != null) o.heightMm = roundScscMm(def.heightMm);
  if (def.fontMm != null) o.fontMm = roundScscMm(def.fontMm);
  else if (def.fontPt != null) o.fontPt = roundScscPt(def.fontPt);
  if (def.lineHeightMm != null) o.lineHeightMm = roundScscMm(def.lineHeightMm);
  if (def.align != null) o.align = def.align;
  if (def.wrapText != null) o.wrapText = def.wrapText;
  if (def.multiline != null) o.multiline = def.multiline;
  if (def.bold != null) o.bold = def.bold;
  return o;
}

export function isScscFieldCalibrated(
  key: string,
  overrides?: ScscFieldOverridesMap | null
): boolean {
  const o = overrides?.[key];
  return Boolean(o && Object.keys(o).length > 0);
}

/** Gộp patch user: snapshot layout đang thấy + thay đổi mới (tránh mặc định ghi đè). */
export function mergeScscFieldUserPatch(
  def: ScscFieldDef | undefined,
  prev: ScscFieldOverridesMap | undefined,
  key: string,
  patch: ScscFieldOverride
): ScscFieldOverridesMap | undefined {
  const snap = def ? scscFieldDefToLayoutOverride(def) : {};
  const combined = normalizeScscFieldOverrideLoose({ ...snap, ...patch });
  if (!combined) return prev;
  return mergeScscFieldOverrides(prev, { [key]: combined });
}
