import type { A4WeighReceiptPrinterProfile, PrinterProfile, ThermalLabelPrinterProfile } from "./printTypes";

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function str(v: unknown, max = 120): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function normalizeThermal(raw: Record<string, unknown>, id: string, name: string): ThermalLabelPrinterProfile {
  return {
    id,
    name,
    type: "thermal-tspl",
    connection: raw.connection === "usb-shared" ? "usb-shared" : "tcp",
    host: str(raw.host, 64),
    port: num(raw.port, 9100, 1, 65535),
    dpi: num(raw.dpi, 203, 150, 600),
    labelWidthMm: num(raw.labelWidthMm, 100, 20, 200),
    labelHeightMm: num(raw.labelHeightMm, 80, 10, 300),
    pageWidthMm: num(raw.pageWidthMm, 80, 20, 200),
    pageHeightMm: num(raw.pageHeightMm, 100, 20, 300),
    gapMm: num(raw.gapMm, 2, 0, 20),
    rotation: ([0, 90, 180, 270] as const).includes(raw.rotation as 0)
      ? (raw.rotation as 0 | 90 | 180 | 270)
      : 90,
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    speed: num(raw.speed, 4, 1, 10),
    density: num(raw.density, 8, 0, 15),
    copiesDefault: num(raw.copiesDefault, 1, 1, 99),
    notes: str(raw.notes, 240),
  };
}

function normalizeA4(raw: Record<string, unknown>, id: string, name: string): A4WeighReceiptPrinterProfile {
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
    notes: str(raw.notes, 240),
  };
}

export function normalizePrinterProfileLoose(raw: unknown): PrinterProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 80) || `profile-${Date.now()}`;
  const name = str(o.name, 80) || "Máy in";
  if (o.type === "a4-browser") return normalizeA4(o, id, name);
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

/** Gộp catalog server vào danh sách local (server thắng khi trùng id). */
export function mergePrinterProfileCatalogs(
  localProfiles: readonly PrinterProfile[],
  serverCatalog: PrinterProfilesCatalog
): PrinterProfile[] {
  const byId = new Map<string, PrinterProfile>();
  for (const p of localProfiles) byId.set(p.id, p);
  for (const p of serverCatalog.profiles) byId.set(p.id, p);
  return [...byId.values()];
}
