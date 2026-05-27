#!/usr/bin/env node
/**
 * Đồng bộ mẫu INV.xlsx từ máy local vào public/templates/invoice/.
 *
 *   npm run sync:invoice-template
 *   INVOICE_TEMPLATE_SOURCE="D:\\path\\INV.xlsx" npm run sync:invoice-template
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = path.join("d:", "project", "data templace", "MIN_TECS", "INV.xlsx");
const source = process.env.INVOICE_TEMPLATE_SOURCE?.trim() || defaultSource;
const destXlsx = path.join(root, "public", "templates", "invoice", "INV.xlsx");
const sourcePdf = path.join(path.dirname(source), "INV.pdf");
const destPdf = path.join(root, "public", "templates", "invoice", "INV.pdf");

if (!fs.existsSync(source)) {
  console.error(`[sync-invoice-template] Không thấy file nguồn: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destXlsx), { recursive: true });
fs.copyFileSync(source, destXlsx);
console.log(`[sync-invoice-template] OK → ${destXlsx}`);

if (fs.existsSync(sourcePdf)) {
  fs.copyFileSync(sourcePdf, destPdf);
  console.log(`[sync-invoice-template] OK → ${destPdf}`);
} else {
  console.warn(`[sync-invoice-template] Không thấy INV.pdf tại ${sourcePdf}`);
}
