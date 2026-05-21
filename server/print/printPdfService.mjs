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
 * @param {import('pg').PoolClient} client
 * @param {{ profileId?: string; templateCode?: string; values: PrintFieldValues; includeBackground?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
export async function generateScscWeighPdfBuffer(client, opts) {
  const { profile, template, fields } = await loadPrintJobContext(client, {
    profileId: opts.profileId,
    templateCode: opts.templateCode ?? "scsc-weigh-a4",
  });

  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
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

    const profileOffsets = {
      offsetXmm: profile.offsetXMm,
      offsetYmm: profile.offsetYMm,
      scaleX: profile.scaleX,
      scaleY: profile.scaleY,
    };

    for (const field of fields) {
      const key = field.fieldKey;
      const text = values[key] ?? "";
      if (key === "otherRequirements" && !String(text).trim()) continue;
      drawFieldText(
        doc,
        {
          pos_x_mm: field.posXMm,
          pos_y_mm: field.posYMm,
          width_mm: field.widthMm,
          font_size_pt: field.fontSizePt,
          line_height_mm: field.lineHeightMm,
          height_mm: field.heightMm,
          max_lines: field.maxLines,
          align: field.align,
          multiline: field.multiline,
          bold: field.bold,
        },
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
