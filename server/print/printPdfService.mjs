import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { mmToPt } from "./printMmUnits.mjs";
import { drawFieldText } from "./printPdfText.mjs";
import { loadPrintJobContext } from "./printTemplateStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

/**
 * @typedef {Record<string, string>} PrintFieldValues
 */

/**
 * Chuẩn hoá field từ DB hoặc client render layer.
 * @param {object} field
 */
function normalizeDrawField(field) {
  return {
    pos_x_mm: field.posXMm ?? field.pos_x_mm,
    pos_y_mm: field.posYMm ?? field.pos_y_mm,
    width_mm: field.widthMm ?? field.width_mm,
    font_size_pt: field.fontSizePt ?? field.font_size_pt,
    line_height_mm: field.lineHeightMm ?? field.line_height_mm,
    height_mm: field.heightMm ?? field.height_mm,
    max_lines: field.maxLines ?? field.max_lines,
    align: field.align ?? "left",
    multiline: Boolean(field.multiline),
    bold: Boolean(field.bold),
  };
}

function readPrintTransform(profile, bodyTransform) {
  if (bodyTransform && typeof bodyTransform === "object") {
    return {
      offsetXmm: Number(bodyTransform.offsetXMm ?? 0),
      offsetYMm: Number(bodyTransform.offsetYMm ?? 0),
      scaleX: Number(bodyTransform.scaleX ?? 1),
      scaleY: Number(bodyTransform.scaleY ?? 1),
    };
  }
  return {
    offsetXmm: profile.offsetXMm,
    offsetYMm: profile.offsetYMm,
    scaleX: profile.scaleX,
    scaleY: profile.scaleY,
  };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ profileId?: string; templateCode?: string; values: PrintFieldValues; renderFields?: object[]; printTransform?: object; includeBackground?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
export async function generateScscWeighPdfBuffer(client, opts) {
  const { profile, template, fields: dbFields } = await loadPrintJobContext(client, {
    profileId: opts.profileId,
    templateCode: opts.templateCode ?? "scsc-weigh-a4",
  });

  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
  const renderFields = Array.isArray(opts.renderFields) ? opts.renderFields : null;
  const fieldsToDraw = renderFields?.length ? renderFields : dbFields;
  const pageW = template.pageWidthMm;
  const pageH = template.pageHeightMm;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mmToPt(pageW), mmToPt(pageH)],
      margin: 0,
      autoFirstPage: true,
      info: {
        Title: "SCSC Weigh Slip",
        Creator: "TECSOPS",
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (opts.includeBackground && template.backgroundAssetUrl) {
      const rel = template.backgroundAssetUrl.replace(/^\//, "");
      const bgPath = path.join(PUBLIC_DIR, rel);
      if (fs.existsSync(bgPath)) {
        doc.image(bgPath, 0, 0, { width: mmToPt(pageW), height: mmToPt(pageH) });
      }
    }

    const profileOffsets = readPrintTransform(profile, opts.printTransform);

    for (const field of fieldsToDraw) {
      const key = field.fieldKey ?? field.field_key;
      const text = values[key] ?? "";
      if (key === "otherRequirements" && !String(text).trim()) continue;
      drawFieldText(
        doc,
        normalizeDrawField(field),
        text,
        profileOffsets
      );
    }

    doc.end();
  });
}

/**
 * Pipe PDF trực tiếp ra HTTP response.
 * @param {import('express').Response} res
 * @param {Buffer} pdf
 * @param {string} [filename]
 */
export function sendPdfResponse(res, pdf, filename = "scsc-weigh.pdf") {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(pdf.length));
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(pdf);
}
