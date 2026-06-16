import PDFDocument from "pdfkit";
import { mmToPt } from "./printMmUnits.mjs";
import { drawFieldText } from "./printPdfText.mjs";
import { registerCsdPdfFonts, csdFontForField } from "./csdPdfFonts.mjs";
import { drawIataCsdVectorForm } from "./csdVectorForm.mjs";
import { resolveCsdRenderMode } from "./csdRenderMode.mjs";

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
    font_name: field.font_name ?? field.fontName ?? null,
    wipe: Boolean(field.wipe),
    wipe_h_mm: field.wipe_h_mm,
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

function drawOverlayBackground(doc, bgPath, pageW, pageH) {
  doc.image(bgPath, 0, 0, {
    fit: [mmToPt(pageW), mmToPt(pageH)],
    align: "center",
    valign: "center",
  });
}

/**
 * @param {{
 *   values: Record<string, string>;
 *   includeBackground?: boolean;
 *   bundle?: import("./csdTemplateLoader.mjs").loadCsdTemplateBundle extends (...args: any) => infer R ? R : never;
 * }} opts
 * @returns {Promise<Buffer>}
 */
export function generateCsdPdfBuffer(opts) {
  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
  const bundle = opts.bundle;
  if (!bundle) {
    throw new Error("Thiếu bundle mẫu CSD.");
  }

  const template = bundle.meta;
  const fields = bundle.fields;
  const pageW = template.page_width_mm;
  const pageH = template.page_height_mm;
  const offsetX = bundle.offset_x_mm ?? 0;
  const offsetY = bundle.offset_y_mm ?? 0;
  const scaleX = bundle.scale_x ?? 1;
  const scaleY = bundle.scale_y ?? 1;
  const renderMode = resolveCsdRenderMode(bundle);

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

    const fonts = registerCsdPdfFonts(doc);
    const profile = { offsetXmm: offsetX, offsetYMm: offsetY, scaleX, scaleY };

    if (renderMode === "vector") {
      drawIataCsdVectorForm(doc, fonts, template);
      for (const field of fields) {
        const key = field.field_key;
        const text = values[key] ?? "";
        if (!String(text).trim() && key !== "consolidationMark") continue;
        const normalized = normalizeDrawField(field);
        normalized.font_name = csdFontForField(fonts, normalized);
        normalized.wipe = false;
        drawFieldText(doc, normalized, text, profile);
      }
    } else {
      const includeBg = opts.includeBackground !== false;
      if (includeBg && bundle.backgroundPath) {
        drawOverlayBackground(doc, bundle.backgroundPath, pageW, pageH);
      }
      for (const field of fields) {
        const key = field.field_key;
        const text = values[key] ?? "";
        if (!String(text).trim() && key !== "consolidationMark") continue;
        const normalized = normalizeDrawField(field);
        wipeField(doc, normalized);
        normalized.font_name = csdFontForField(fonts, normalized);
        drawFieldText(doc, normalized, text, profile);
      }
    }

    doc.end();
  });
}

export { sendPdfResponse } from "./printPdfService.mjs";

export { resolveCsdRenderMode } from "./csdRenderMode.mjs";
