import { num, str } from "../../shared/primitiveNormalize.mjs";
import type { PrinterProfile, ThermalLabelPrinterProfile } from "./printTypes";
import { withThermalLabelFormat } from "./thermalLabelFormat";

export type PrinterProfilesCatalog = {
  version: 1;
  profiles: PrinterProfile[];
  updatedAt: string;
};

export const EMPTY_PRINTER_PROFILES_CATALOG: PrinterProfilesCatalog = {
  version: 1,
  profiles: [],
  updatedAt: new Date(0).toISOString(),
};

function normalizeThermal(raw: Record<string, unknown>, id: string, name: string): ThermalLabelPrinterProfile {
  const base: ThermalLabelPrinterProfile = {
    id,
    name,
    type: "thermal-tspl",
    connection: raw.connection === "usb-shared" ? "usb-shared" : "tcp",
    windowsPrinterName: str(raw.windowsPrinterName, 120),
    host: str(raw.host, 64),
    port: num(raw.port, 9100, 1, 65535),
    dpi: num(raw.dpi, 203, 150, 600),
    labelWidthMm: num(raw.labelWidthMm, 100, 20, 200),
    labelHeightMm: num(raw.labelHeightMm, 80, 10, 300),
    pageWidthMm: num(raw.pageWidthMm, 100, 20, 200),
    pageHeightMm: num(raw.pageHeightMm, 80, 20, 300),
    gapMm: num(raw.gapMm, 2, 0, 20),
    rotation: ([0, 90, 180, 270] as const).includes(raw.rotation as 0)
      ? (raw.rotation as 0 | 90 | 180 | 270)
      : 0,
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    speed: num(raw.speed, 4, 1, 10),
    density: num(raw.density, 10, 0, 15),
    copiesDefault: num(raw.copiesDefault, 1, 1, 99),
    labelSheetFormat: raw.labelSheetFormat === "100x50" ? "100x50" : "100x80",
    notes: str(raw.notes, 240),
  };
  return withThermalLabelFormat(base);
}

export function normalizePrinterProfileLoose(raw: unknown): PrinterProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 80) || `profile-${Date.now()}`;
  const name = str(o.name, 80) || "Máy in";
  if (o.type === "thermal-tspl") return normalizeThermal(o, id, name);
  return null;
}

export function clampPrinterProfilesCatalog(raw: unknown): PrinterProfilesCatalog {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PRINTER_PROFILES_CATALOG };
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.profiles) ? o.profiles : [];
  const profiles: PrinterProfile[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 40)) {
    const p = normalizePrinterProfileLoose(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    profiles.push(p);
  }
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim() ? o.updatedAt.trim() : new Date().toISOString();
  return { version: 1, profiles, updatedAt };
}
