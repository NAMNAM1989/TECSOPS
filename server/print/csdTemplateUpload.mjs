import fs from "node:fs";
import path from "node:path";
import { CSD_A4_PAGE, listCsdAirlineEntries } from "./csdAirlineCatalog.mjs";
import {
  airlineSlotDir,
  CSD_AIRLINES_DIR,
  CSD_TEMPLATES_ROOT,
  isAirlineTemplateReady,
} from "./csdTemplateLoader.mjs";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function normalizeAwbPrefix(raw) {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 3);
  return d.length === 3 ? d : "";
}

/** Gộp catalog mặc định + slot đã tạo trên disk (kể cả prefix tùy chỉnh). */
export function listAllCsdSlotEntries() {
  const map = new Map(listCsdAirlineEntries().map((e) => [e.awbPrefix, e.airlineName]));
  const airlinesRoot = path.join(CSD_TEMPLATES_ROOT, CSD_AIRLINES_DIR);
  if (fs.existsSync(airlinesRoot)) {
    for (const name of fs.readdirSync(airlinesRoot, { withFileTypes: true })) {
      if (!name.isDirectory() || !/^\d{3}$/.test(name.name)) continue;
      if (map.has(name.name)) continue;
      const metaPath = path.join(airlinesRoot, name.name, "meta.json");
      let airlineName = `AWB ${name.name}`;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          if (meta?.airlineName) airlineName = String(meta.airlineName);
        } catch {
          /* ignore */
        }
      }
      map.set(name.name, airlineName);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([awbPrefix, airlineName]) => ({ awbPrefix, airlineName }));
}

export function ensureAirlineSlot(awbPrefix, airlineName = "") {
  const prefix = normalizeAwbPrefix(awbPrefix);
  if (!prefix) throw new Error("Mã AWB phải đủ 3 chữ số.");
  const slotAbs = path.join(CSD_TEMPLATES_ROOT, airlineSlotDir(prefix));
  fs.mkdirSync(slotAbs, { recursive: true });
  const metaPath = path.join(slotAbs, "meta.json");
  const name = String(airlineName ?? "").trim() || `AWB ${prefix}`;
  const meta = {
    awbPrefix: prefix,
    airlineName: name,
    name: `${name} CSD`,
    paper: "A4",
    page_width_mm: CSD_A4_PAGE.page_width_mm,
    page_height_mm: CSD_A4_PAGE.page_height_mm,
    status: isAirlineTemplateReady(prefix) ? "ready" : "pending",
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return { prefix, slotAbs, meta };
}

function removeBackgroundFiles(slotAbs) {
  for (const name of ["background.png", "background.jpg", "background.webp"]) {
    const p = path.join(slotAbs, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

/**
 * @param {string} awbPrefix
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} [airlineName]
 */
export function saveCsdTemplateBackground(awbPrefix, buffer, mimeType, airlineName = "") {
  const mime = String(mimeType ?? "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error("Chỉ hỗ trợ PNG, JPG hoặc WEBP (scan form A4).");
  }
  if (!buffer?.length) throw new Error("File rỗng.");
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error("File quá lớn (tối đa 12MB).");
  }

  const { prefix, slotAbs } = ensureAirlineSlot(awbPrefix, airlineName);
  removeBackgroundFiles(slotAbs);
  const ext = EXT_BY_MIME[mime] ?? ".png";
  const outPath = path.join(slotAbs, `background${ext}`);
  fs.writeFileSync(outPath, buffer);

  const metaPath = path.join(slotAbs, "meta.json");
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
      meta = {};
    }
  }
  meta.status = "ready";
  meta.backgroundFile = path.basename(outPath);
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return {
    awbPrefix: prefix,
    status: "ready",
    backgroundFile: path.basename(outPath),
    slotDir: airlineSlotDir(prefix),
  };
}

export function deleteCsdTemplateBackground(awbPrefix) {
  const prefix = normalizeAwbPrefix(awbPrefix);
  if (!prefix) throw new Error("Mã AWB không hợp lệ.");
  const slotAbs = path.join(CSD_TEMPLATES_ROOT, airlineSlotDir(prefix));
  if (!fs.existsSync(slotAbs)) {
    return { awbPrefix: prefix, status: "pending" };
  }
  removeBackgroundFiles(slotAbs);
  const metaPath = path.join(slotAbs, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      meta.status = "pending";
      delete meta.backgroundFile;
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch {
      /* ignore */
    }
  }
  return { awbPrefix: prefix, status: "pending" };
}

export function decodeUploadBody(body) {
  const awbPrefix = normalizeAwbPrefix(body?.awbPrefix);
  if (!awbPrefix) throw new Error("Thiếu mã AWB 3 số.");
  const dataBase64 = String(body?.dataBase64 ?? "").trim();
  if (!dataBase64) throw new Error("Thiếu nội dung file.");
  const mimeType = String(body?.mimeType ?? "image/png").toLowerCase();
  const airlineName = String(body?.airlineName ?? "").trim();
  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    throw new Error("Dữ liệu file không hợp lệ.");
  }
  return { awbPrefix, buffer, mimeType, airlineName };
}
