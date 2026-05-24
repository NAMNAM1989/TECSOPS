/**
 * Nhập mẫu phiếu cân SCSC từ PDF A4 → PNG preview + copy PDF vào public.
 * Usage: node scripts/import-scsc-template.mjs [path-to-pdf]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdf } from "pdf-to-img";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPdf = "D:\\project\\data templace\\templace_scsc.pdf";
const srcPdf = path.resolve(process.argv[2] || defaultPdf);
const outDir = path.join(root, "public", "print-templates");
const outPdf = path.join(outDir, "scsc-weigh-template.pdf");
const outPng = path.join(outDir, "scsc-weigh-template.png");

if (!fs.existsSync(srcPdf)) {
  console.error("Không tìm thấy PDF:", srcPdf);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(srcPdf, outPdf);

/** ~300 DPI cho A4 (2480×3508) — scale 4 từ 72 DPI gốc PDF. */
const SCALE = 4;
const doc = await pdf(srcPdf, { scale: SCALE });

let page = 0;
for await (const image of doc) {
  page += 1;
  if (page > 1) break;
  fs.writeFileSync(outPng, image);
  console.log("Wrote PNG:", outPng, `(${image.length} bytes, scale=${SCALE})`);
}

if (page === 0) {
  console.error("PDF không có trang nào.");
  process.exit(1);
}

console.log("Copied PDF:", outPdf);
console.log("Done — cập nhật preview tại /print-templates/scsc-weigh-template.png");
