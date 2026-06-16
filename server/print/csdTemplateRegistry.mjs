import fs from "node:fs";
import path from "node:path";
import {
  awbPrefixFromAwb,
  CSD_A4_PAGE,
  listCsdAirlineEntries,
} from "./csdAirlineCatalog.mjs";
import { listAllCsdSlotEntries } from "./csdTemplateUpload.mjs";
import {
  airlineSlotDir,
  CSD_DEFAULT_DIR,
  CSD_TEMPLATES_ROOT,
  isAirlineTemplateReady,
  loadCsdTemplateBundle,
} from "./csdTemplateLoader.mjs";
import { resolveCsdRenderMode } from "./csdRenderMode.mjs";

function readSlotMeta(slotAbs) {
  const p = path.join(slotAbs, "meta.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Chọn mẫu CSD theo AWB:
 * 1. `airlines/{prefix}/` — vector IATA hoặc overlay scan hãng
 * 2. `_default` (IATA vector fallback)
 *
 * @param {string} awb
 * @param {{ forceDefault?: boolean; awbPrefixOverride?: string }} [opts]
 */
export function resolveCsdTemplateForAwb(awb, opts = {}) {
  const prefix = opts.awbPrefixOverride?.trim() || awbPrefixFromAwb(awb);
  const airlineEntry = listCsdAirlineEntries().find((e) => e.awbPrefix === prefix) ?? null;

  let useCustom = false;
  let templateDir = CSD_DEFAULT_DIR;
  let status = "default";

  if (!opts.forceDefault && prefix && isAirlineTemplateReady(prefix)) {
    templateDir = airlineSlotDir(prefix);
    useCustom = true;
    status = "ready";
  } else if (!opts.forceDefault && prefix && airlineEntry) {
    status = "pending";
  } else if (!opts.forceDefault && prefix && !airlineEntry) {
    status = "unknown-prefix";
  }

  const bundle = loadCsdTemplateBundle(templateDir);
  const renderMode = resolveCsdRenderMode(bundle);
  const slotMetaPath = prefix
    ? path.join(CSD_TEMPLATES_ROOT, airlineSlotDir(prefix), "meta.json")
    : null;
  const slotMeta = slotMetaPath && fs.existsSync(slotMetaPath)
    ? JSON.parse(fs.readFileSync(slotMetaPath, "utf8"))
    : null;

  return {
    awbPrefix: prefix || null,
    airlineName: airlineEntry?.airlineName ?? slotMeta?.airlineName ?? null,
    status,
    useCustomTemplate: useCustom,
    templateDir,
    templateName: useCustom
      ? slotMeta?.name ?? `${airlineEntry?.airlineName ?? prefix} CSD`
      : bundle.meta.name,
    renderMode,
    paper: bundle.meta.paper ?? "A4",
    page: {
      width_mm: bundle.meta.page_width_mm,
      height_mm: bundle.meta.page_height_mm,
    },
    bundle,
  };
}

/** Danh mục slot CSD — dùng UI gán form từng hãng. */
export function listCsdTemplateCatalog() {
  const defaultBundle = loadCsdTemplateBundle(CSD_DEFAULT_DIR);
  const airlines = listAllCsdSlotEntries().map(({ awbPrefix, airlineName }) => {
    const ready = isAirlineTemplateReady(awbPrefix);
    const slotDir = airlineSlotDir(awbPrefix);
    const slotAbs = path.join(CSD_TEMPLATES_ROOT, slotDir);
    const slotMeta = readSlotMeta(slotAbs);
    const hasFields = fs.existsSync(path.join(slotAbs, "fields.json"));
    const hasBg = Boolean(
      fs.existsSync(path.join(slotAbs, "background.png")) ||
        fs.existsSync(path.join(slotAbs, "background.jpg"))
    );
    const mode = String(slotMeta?.renderMode ?? (hasBg ? "overlay" : "vector")).toLowerCase();
    return {
      awbPrefix,
      airlineName,
      status: ready ? "ready" : "pending",
      renderMode: mode,
      slotDir,
      uploadHint:
        mode === "vector"
          ? "Form vector IATA (giấy trắng) — tuỳ chọn fields.json để căn tọa độ"
          : `public/print-templates/csd/${slotDir}/background.png (overlay scan)`,
      hasCustomBackground: hasBg,
      hasCustomFields: hasFields,
    };
  });

  const readyCount = airlines.filter((a) => a.status === "ready").length;

  return {
    paper: "A4",
    defaultPage: CSD_A4_PAGE,
    defaultTemplate: {
      dir: CSD_DEFAULT_DIR,
      name: defaultBundle.meta.name,
      hasBackground: Boolean(defaultBundle.backgroundPath),
    },
    airlines,
    summary: {
      total: airlines.length,
      ready: readyCount,
      pending: airlines.length - readyCount,
    },
  };
}
