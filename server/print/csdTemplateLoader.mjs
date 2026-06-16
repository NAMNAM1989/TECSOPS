import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsdDefaultFields } from "./csdTemplateDefaults.mjs";
import { CSD_A4_PAGE } from "./csdAirlineCatalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CSD_TEMPLATES_ROOT = path.join(__dirname, "..", "..", "public", "print-templates", "csd");
export const CSD_DEFAULT_DIR = "_default";
export const CSD_AIRLINES_DIR = "airlines";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveBackgroundPath(dirAbs) {
  for (const name of ["background.png", "background.jpg", "background.webp"]) {
    const p = path.join(dirAbs, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string} dirName thư mục con trong `csd/` (vd. `_default`, `airlines/738`)
 */
export function loadCsdTemplateBundle(dirName) {
  const dirAbs = path.join(CSD_TEMPLATES_ROOT, dirName);
  const meta =
    readJsonFile(path.join(dirAbs, "meta.json")) ??
    ({
      ...CSD_A4_PAGE,
      code: dirName.replace(/\//g, "-"),
      name: dirName,
    });

  const fieldsJson = readJsonFile(path.join(dirAbs, "fields.json"));
  const fields = Array.isArray(fieldsJson?.fields)
    ? fieldsJson.fields
    : Array.isArray(fieldsJson)
      ? fieldsJson
      : buildCsdDefaultFields();

  const backgroundPath = resolveBackgroundPath(dirAbs);
  const pageW = Number(meta.page_width_mm) || CSD_A4_PAGE.page_width_mm;
  const pageH = Number(meta.page_height_mm) || CSD_A4_PAGE.page_height_mm;

  return {
    dirName,
    dirAbs,
    meta: {
      code: String(meta.code ?? dirName),
      name: String(meta.name ?? dirName),
      page_width_mm: pageW,
      page_height_mm: pageH,
      paper: meta.paper ?? "A4",
      renderMode: meta.renderMode ?? (backgroundPath ? "overlay" : "vector"),
    },
    fields,
    backgroundPath,
    offset_x_mm: Number(meta.offset_x_mm) || 0,
    offset_y_mm: Number(meta.offset_y_mm) || 0,
    scale_x: Number(meta.scale_x) || 1,
    scale_y: Number(meta.scale_y) || 1,
  };
}

export function airlineSlotDir(awbPrefix) {
  return path.join(CSD_AIRLINES_DIR, awbPrefix);
}

export function isAirlineTemplateReady(awbPrefix) {
  const slot = path.join(CSD_TEMPLATES_ROOT, airlineSlotDir(awbPrefix));
  const meta = readJsonFile(path.join(slot, "meta.json"));
  if (String(meta?.renderMode ?? "").toLowerCase() === "vector") return true;
  return Boolean(resolveBackgroundPath(slot));
}
