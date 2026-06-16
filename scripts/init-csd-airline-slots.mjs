/**
 * Khởi tạo thư mục mẫu CSD A4 + slot từng hãng (chưa có background → pending).
 * Chạy: node scripts/init-csd-airline-slots.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCsdDefaultFields, CSD_TEMPLATE } from "../server/print/csdTemplateDefaults.mjs";
import { listCsdAirlineEntries } from "../server/print/csdAirlineCatalog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const csdRoot = path.join(root, "public", "print-templates", "csd");
const defaultDir = path.join(csdRoot, "_default");
const airlinesRoot = path.join(csdRoot, "airlines");
const legacyPng = path.join(root, "public", "print-templates", "csd-template.png");

fs.mkdirSync(defaultDir, { recursive: true });
fs.mkdirSync(airlinesRoot, { recursive: true });

const defaultMeta = {
  code: CSD_TEMPLATE.code,
  name: CSD_TEMPLATE.name,
  paper: "A4",
  page_width_mm: CSD_TEMPLATE.page_width_mm,
  page_height_mm: CSD_TEMPLATE.page_height_mm,
  offset_x_mm: 0,
  offset_y_mm: 0,
  scale_x: 1,
  scale_y: 1,
};

fs.writeFileSync(path.join(defaultDir, "meta.json"), JSON.stringify(defaultMeta, null, 2));
fs.writeFileSync(
  path.join(defaultDir, "fields.json"),
  JSON.stringify({ fields: buildCsdDefaultFields() }, null, 2)
);

const defaultBg = path.join(defaultDir, "background.png");
if (!fs.existsSync(defaultBg) && fs.existsSync(legacyPng)) {
  fs.copyFileSync(legacyPng, defaultBg);
}

for (const { awbPrefix, airlineName } of listCsdAirlineEntries()) {
  const slotDir = path.join(airlinesRoot, awbPrefix);
  fs.mkdirSync(slotDir, { recursive: true });
  const metaPath = path.join(slotDir, "meta.json");
  const readmePath = path.join(slotDir, "README.txt");
  const meta = {
    awbPrefix,
    airlineName,
    name: `${airlineName} CSD`,
    paper: "A4",
    page_width_mm: 210,
    page_height_mm: 297,
    status: "pending",
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  fs.writeFileSync(
    readmePath,
    [
      `Slot CSD — ${airlineName} (AWB prefix ${awbPrefix})`,
      "",
      "Để kích hoạt mẫu riêng cho hãng này:",
      "1. Đặt scan/PDF form A4 vào background.png (hoặc .jpg)",
      "2. (Tuỳ chọn) fields.json — tọa độ 17 field; bỏ trống sẽ dùng mặc định IATA",
      "3. Reload — Print Center sẽ hiện trạng thái «Đã gán»",
      "",
      `Thư mục: public/print-templates/csd/airlines/${awbPrefix}/`,
    ].join("\n")
  );
}

console.info(`[init-csd] _default + ${listCsdAirlineEntries().length} airline slots → ${csdRoot}`);
