/** Đồng bộ với `src/printing/printerProfilesCore.ts` */

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
    rotation: [0, 90, 180, 270].includes(raw.rotation) ? raw.rotation : 90,
    offsetXmm: num(raw.offsetXmm, 0, -30, 30),
    offsetYmm: num(raw.offsetYmm, 0, -30, 30),
    speed: num(raw.speed, 4, 1, 10),
    density: num(raw.density, 8, 0, 15),
    copiesDefault: num(raw.copiesDefault, 1, 1, 99),
    notes: str(raw.notes, 240),
  };
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
