#!/usr/bin/env node
/**
 * Đọc data_invoice.xlsx (catalog mặt hàng) -> ghi JSON tĩnh phục vụ client.
 * Mặc định nguồn: d:\project\data templace\MIN_TECS\data_invoice.xlsx
 * Đầu ra:        public/templates/invoice/data_invoice.json
 * Có thể chạy lại mỗi khi catalog thay đổi qua: npm run sync:invoice-catalog
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const SOURCE =
  process.argv[2] ??
  "d:/project/data templace/MIN_TECS/data_invoice.xlsx";
const PUBLIC_XLSX = resolve(repoRoot, "public/templates/invoice/data_invoice.xlsx");
const OUT_JSON = resolve(repoRoot, "public/templates/invoice/data_invoice.json");

if (!existsSync(SOURCE)) {
  console.error(`Không thấy nguồn: ${SOURCE}`);
  process.exit(1);
}

function cellNumber(cell) {
  const v = cell?.value;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if ("result" in v && typeof v.result === "number") return v.result;
    if ("formula" in v) {
      // Cố tính lại formula đơn giản dạng =Ex*Gx -> bỏ qua, để 0 và đồng bộ qua kgPerUnit*sampleQuantity ở client.
      return 0;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
    if ("result" in v && typeof v.result === "string") return v.result.trim();
  }
  return String(v).trim();
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const ws = wb.worksheets[0];
if (!ws) {
  console.error("Không tìm thấy sheet đầu tiên");
  process.exit(1);
}

const items = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const description = cellText(ws.getCell(`B${r}`));
  if (!description) continue;
  const category = cellText(ws.getCell(`A${r}`));
  const hsCode = cellText(ws.getCell(`C${r}`)) || "";
  const origin = cellText(ws.getCell(`D${r}`)) || "VN";
  const sampleQuantity = cellNumber(ws.getCell(`E${r}`));
  const unit = cellText(ws.getCell(`F${r}`)) || "PCE";
  const unitPriceUsd = cellNumber(ws.getCell(`G${r}`));
  const kgPerUnit = cellNumber(ws.getCell(`I${r}`));
  items.push({
    id: `inv-${r - 1}`,
    category,
    description,
    hsCode,
    origin,
    sampleQuantity,
    unit,
    unitPriceUsd,
    kgPerUnit,
  });
}

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify({ version: 1, items }, null, 2), "utf8");
// Đồng bộ xlsx gốc (dùng cho dev hoặc audit).
if (resolve(SOURCE) !== PUBLIC_XLSX) {
  mkdirSync(dirname(PUBLIC_XLSX), { recursive: true });
  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(PUBLIC_XLSX, Buffer.from(buf));
}
console.log(`OK: ${items.length} mặt hàng -> ${OUT_JSON}`);
