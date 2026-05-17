/** Đồng bộ với `src/printing/printerProfilesCore.ts` */

import { normalizeLabelTemplateLoose } from "./labelTemplateNormalize.mjs";

export function emptyPrinterProfilesCatalog() {
  return { version: 1, profiles: [], updatedAt: new Date(0).toISOString() };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function str(v, max = 120) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function num(v, fallback, min, max) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function normalizeThermal(raw, id, name) {
  const labelSheetFormat = raw.labelSheetFormat === "100x50" ? "100x50" : "100x80";
  const preset =
    labelSheetFormat === "100x50"
      ? { labelWidthMm: 100, labelHeightMm: 50, pageWidthMm: 50, pageHeightMm: 100 }
      : { labelWidthMm: 100, labelHeightMm: 80, pageWidthMm: 80, pageHeightMm: 100 };
  return {
    id,
    name,
    type: "thermal-tspl",
    connection: raw.connection === "usb-shared" ? "usb-shared" : "tcp",
    host: str(raw.host, 64),
    port: num(raw.port, 9100, 1, 65535),
    dpi: num(raw.dpi, 203, 150, 600),
    labelWidthMm: num(raw.labelWidthMm, preset.labelWidthMm, 20, 200),
    labelHeightMm: num(raw.labelHeightMm, preset.labelHeightMm, 10, 300),
    pageWidthMm: num(raw.pageWidthMm, preset.pageWidthMm, 20, 200),
    pageHeightMm: num(raw.pageHeightMm, preset.pageHeightMm, 20, 300),
    gapMm: num(raw.gapMm, 2, 0, 20),
    rotation: [0, 90, 180, 270].includes(raw.rotation) ? raw.rotation : 90,
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    speed: num(raw.speed, 4, 1, 10),
    density: num(raw.density, 8, 0, 15),
    copiesDefault: num(raw.copiesDefault, 1, 1, 99),
    labelSheetFormat,
    thermalFieldOverrides: normalizeThermalFieldOverridesLoose(raw.thermalFieldOverrides),
    labelTemplate: normalizeLabelTemplateLoose(raw.labelTemplate),
    notes: str(raw.notes, 240),
  };
}

/** @param {unknown} raw */
function normalizeThermalFieldOverridesLoose(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {};
  let count = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (count >= 32) break;
    if (!val || typeof val !== "object") continue;
    const k = String(key).slice(0, 48);
    const o = val;
    const entry = {};
    const x = clampOverrideNum(o.x, 0, 100);
    const y = clampOverrideNum(o.y, 0, 80);
    const fontMm = clampOverrideNum(o.fontMm, 1.5, 28);
    const mulX = clampOverrideNum(o.mulX, 1, 4);
    const mulY = clampOverrideNum(o.mulY, 1, 4);
    const tsplFont = String(o.tsplFont ?? "")
      .trim()
      .slice(0, 2);
    if (x != null) entry.x = x;
    if (y != null) entry.y = y;
    if (fontMm != null) entry.fontMm = fontMm;
    if (mulX != null) entry.mulX = mulX;
    if (mulY != null) entry.mulY = mulY;
    if (tsplFont) entry.tsplFont = tsplFont;
    if (Object.keys(entry).length) {
      out[k] = entry;
      count += 1;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

function clampOverrideNum(v, min, max) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return roundHalf(clamp(n, min, max));
}

/** @param {unknown} raw */
function normalizeScscFieldOverridesLoose(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {};
  let count = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (count >= 48) break;
    if (!val || typeof val !== "object") continue;
    const k = String(key).slice(0, 48);
    const o = val;
    const entry = {};
    const x = clampOverrideNum(o.x, 0, 205);
    const y = clampOverrideNum(o.y, 0, 292);
    const width = clampOverrideNum(o.width, 4, 195);
    const heightMm = clampOverrideNum(o.heightMm, 2, 80);
    const fontMm = clampOverrideNum(o.fontMm, 1.5, 12);
    const fontPt = clampOverrideNum(o.fontPt, 5, 24);
    const lineHeightMm = clampOverrideNum(o.lineHeightMm, 2, 20);
    if (x != null) entry.x = x;
    if (y != null) entry.y = y;
    if (width != null) entry.width = width;
    if (heightMm != null) entry.heightMm = heightMm;
    if (fontMm != null) entry.fontMm = fontMm;
    else if (fontPt != null) entry.fontPt = fontPt;
    if (lineHeightMm != null) entry.lineHeightMm = lineHeightMm;
    if (Object.keys(entry).length) {
      out[k] = entry;
      count += 1;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeA4(raw, id, name) {
  return {
    id,
    name,
    type: "a4-browser",
    paper: "A4",
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    scaleX: num(raw.scaleX, 1, 0.85, 1.15),
    scaleY: num(raw.scaleY, 1, 0.85, 1.15),
    templateVersion: str(raw.templateVersion, 40) || "scsc-weigh-v1",
    partyLineGapMm: num(raw.partyLineGapMm, 6, 4, 12),
    partyAddressFontMm: num(raw.partyAddressFontMm, 3, 2.5, 5.5),
    partyNameFontMm: num(raw.partyNameFontMm, 4, 3, 6),
    partyContactFontMm: num(raw.partyContactFontMm, 3, 2.5, 5.5),
    scscFieldOverrides: normalizeScscFieldOverridesLoose(raw.scscFieldOverrides),
    labelTemplate: normalizeLabelTemplateLoose(raw.labelTemplate),
    notes: str(raw.notes, 240),
  };
}

function normalizeProfileLoose(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id, 80);
  const name = str(raw.name, 80);
  if (!id || !name) return null;
  if (raw.type === "a4-browser") return normalizeA4(raw, id, name);
  if (raw.type === "thermal-tspl") return normalizeThermal(raw, id, name);
  return null;
}

export function normalizePrinterProfilesCatalogLoose(raw) {
  if (!raw || typeof raw !== "object") return emptyPrinterProfilesCatalog();
  const list = Array.isArray(raw.profiles) ? raw.profiles : [];
  const profiles = [];
  const seen = new Set();
  for (const item of list.slice(0, 40)) {
    const p = normalizeProfileLoose(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    profiles.push(p);
  }
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt.trim()
      : new Date().toISOString();
  return { version: 1, profiles, updatedAt };
}
