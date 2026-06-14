import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { mmToPt } from "./printMmUnits.mjs";
import { drawFieldText } from "./printPdfText.mjs";
import { buildCsdDefaultFields, CSD_TEMPLATE } from "./csdTemplateDefaults.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

function normalizeDrawField(field) {
  return {
    pos_x_mm: field.pos_x_mm,
    pos_y_mm: field.pos_y_mm,
    width_mm: field.width_mm,
    font_size_pt: field.font_size_pt,
    line_height_mm: field.line_height_mm,
    height_mm: field.height_mm,
    max_lines: field.max_lines,
    align: field.align ?? "left",
    multiline: Boolean(field.multiline),
    bold: Boolean(field.bold),
  };
}

function wipeField(doc, field) {
  if (!field.wipe) return;
  const x = mmToPt(Number(field.pos_x_mm) || 0);
  const y = mmToPt(Number(field.pos_y_mm) || 0);
  const w = mmToPt(Number(field.width_mm) || 20);
  const h = mmToPt(Number(field.wipe_h_mm) || Number(field.height_mm) || 6);
  doc.save();
  doc.rect(x - mmToPt(0.5), y - mmToPt(0.3), w + mmToPt(1), h + mmToPt(0.5)).fill("#ffffff");
  doc.restore();
}

/**
 * @param {{ values: Record<string, string>; includeBackground?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
export function generateCsdPdfBuffer(opts) {
  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
  const template = CSD_TEMPLATE;
  const fields = buildCsdDefaultFields();
  const pageW = template.page_width_mm;
  const pageH = template.page_height_mm;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mmToPt(pageW), mmToPt(pageH)],
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: "Consignment Security Declaration",
        Creator: "TECSOPS",
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const includeBg = opts.includeBackground !== false;
    if (includeBg && template.background_asset_url) {
      const rel = template.background_asset_url.replace(/^\//, "");
      const bgPath = path.join(PUBLIC_DIR, rel);
      if (fs.existsSync(bgPath)) {
        doc.image(bgPath, 0, 0, { width: mmToPt(pageW), height: mmToPt(pageH) });
      } else {
        const pdfPath = path.join(PUBLIC_DIR, "print-templates", "csd-template.pdf");
        if (fs.existsSync(pdfPath)) {
          console.warn("[csd] thiếu PNG nền — chỉ in text lên trang trắng");
        }
      }
    }

    for (const field of fields) {
      const key = field.field_key;
      const text = values[key] ?? "";
      if (!String(text).trim() && key !== "consolidationMark") continue;
      wipeField(doc, field);
      drawFieldText(doc, normalizeDrawField(field), text, { offsetXmm: 0, offsetYMm: 0, scaleX: 1, scaleY: 1 });
    }

    doc.end();
  });
}

export { sendPdfResponse } from "./printPdfService.mjs";
