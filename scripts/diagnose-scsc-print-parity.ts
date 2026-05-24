/**
 * Chẩn đoán parity preview vs in (HTML/PDF).
 * Chạy: npx tsx scripts/diagnose-scsc-print-parity.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScscWeighReceiptDocumentHtml } from "../src/printing/scscWeigh/scscWeighPrint.ts";
import { resolveScscWeighPrintLayer } from "../src/printing/scscWeigh/scscWeighTemplate.ts";
import { buildScscWeighOverlayValues } from "../src/printing/scscWeigh/scscWeighTemplate.ts";
import { defaultScscWeighPrintSettings } from "../src/printing/scscWeigh/scscWeighPrintSettingsCore.ts";
import { scscPrintLayerToPdfRenderFields } from "../src/utils/printFieldConvert.ts";
import { SAMPLE_SCSC_FORM_DATA } from "../src/utils/scscWeighPdfPrint.ts";
import type { A4WeighReceiptPrinterProfile } from "../src/printing/printTypes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "tmp");

const profile: A4WeighReceiptPrinterProfile = {
  id: "diag-a4",
  name: "Diagnostic",
  type: "a4-browser",
  paper: "A4",
  offsetXmm: 1,
  offsetYmm: -0.5,
  scaleX: 1.02,
  scaleY: 1.01,
  templateVersion: "1",
  scscFieldOverrides: {
    goods: { y: 161.5, width: 70 },
    senderName: { y: 258, align: "center" },
    pieces: { y: 169 },
  },
};

const values = buildScscWeighOverlayValues(SAMPLE_SCSC_FORM_DATA, defaultScscWeighPrintSettings(), "TECS-SCSC");
const layer = resolveScscWeighPrintLayer(profile, values);
const pdfFields = scscPrintLayerToPdfRenderFields(layer.fields);

const html = buildScscWeighReceiptDocumentHtml(SAMPLE_SCSC_FORM_DATA, {
  profile,
  overlayValues: values,
  warehouse: "TECS-SCSC",
});

const report = {
  generatedAt: new Date().toISOString(),
  printApiNote: "Local dev thường không có DATABASE_URL → in qua HTML iframe, không phải PDF.",
  fieldCount: layer.fields.length,
  sampleFields: ["goods", "senderName", "pieces", "shipperAddress1"].map((key) => {
    const def = layer.fields.find((f) => f.key === key);
    const pdf = pdfFields.find((f) => f.fieldKey === key);
    return {
      key,
      preview: def
        ? { x: def.x, y: def.y, width: def.width, align: def.align, fontMm: def.fontMm, fontPt: def.fontPt, multiline: def.multiline, heightMm: def.heightMm }
        : null,
      pdfPayload: pdf,
      valuePreview: (layer.values[key] ?? "").slice(0, 80),
    };
  }),
  htmlHasFlexForSender: html.includes("display:flex") && html.includes("justify-content:center"),
  htmlHasPrintFieldBlockOverride: /\.print-field[^}]*display:\s*block\s*!important/.test(html),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "scsc-print-parity-report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, "scsc-print-parity-preview.html"), html);

console.log("=== SCSC print parity diagnostic ===");
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote: tmp/scsc-print-parity-report.json`);
console.log(`Wrote: tmp/scsc-print-parity-preview.html (mở file này → Ctrl+P so với modal preview)`);

if (report.htmlHasPrintFieldBlockOverride) {
  console.error("\nFAIL: .print-field vẫn bị display:block !important — lệch preview.");
  process.exit(1);
}
if (!report.htmlHasFlexForSender) {
  console.warn("\nWARN: HTML không có flex căn giữa sender — kiểm tra fieldStyle.");
}
