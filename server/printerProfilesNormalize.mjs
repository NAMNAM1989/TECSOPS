/**
 * Đồng bộ với `src/printing/printerProfilesCore.ts` — normalize cơ bản.
 * Preset mm: `shared/thermalLabelPresets.mjs` (server giữ custom mm nếu có; client force preset).
 * Helpers: `shared/primitiveNormalize.mjs`.
 */
import { num, str } from "../shared/primitiveNormalize.mjs";
import {
  normalizeLabelSheetFormat,
  thermalPresetForFormat,
} from "../shared/thermalLabelPresets.mjs";

export function emptyPrinterProfilesCatalog() {
  return { version: 1, profiles: [], updatedAt: new Date(0).toISOString() };
}

function normalizeThermal(raw, id, name) {
  const labelSheetFormat = normalizeLabelSheetFormat(raw.labelSheetFormat);
  const preset = thermalPresetForFormat(labelSheetFormat);
  return {
    id,
    name,
    type: "thermal-tspl",
    connection: raw.connection === "usb-shared" ? "usb-shared" : "tcp",
    windowsPrinterName: str(raw.windowsPrinterName, 120),
    host: str(raw.host, 64),
    port: num(raw.port, 9100, 1, 65535),
    dpi: num(raw.dpi, 203, 150, 600),
    labelWidthMm: num(raw.labelWidthMm, preset.labelWidthMm, 20, 200),
    labelHeightMm: num(raw.labelHeightMm, preset.labelHeightMm, 10, 300),
    pageWidthMm: num(raw.pageWidthMm, preset.pageWidthMm, 20, 200),
    pageHeightMm: num(raw.pageHeightMm, preset.pageHeightMm, 20, 300),
    gapMm: num(raw.gapMm, 2, 0, 20),
    rotation: [0, 90, 180, 270].includes(raw.rotation) ? raw.rotation : 0,
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    speed: num(raw.speed, 4, 1, 10),
    density: num(raw.density, 10, 0, 15),
    copiesDefault: num(raw.copiesDefault, 1, 1, 99),
    labelSheetFormat,
    notes: str(raw.notes, 240),
  };
}

function normalizeProfileLoose(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id, 80);
  const name = str(raw.name, 80);
  if (!id || !name) return null;
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
