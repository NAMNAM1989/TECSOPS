import { buildInvoiceExportHtml } from "./invoicePdfHtml.mjs";
import { renderInvoicePdfFromHtml } from "./renderInvoicePdfPlaywright.mjs";
import { renderInvoiceExcelBuffer } from "./renderInvoiceExcel.mjs";
import { exportPayloadToPdfKit, validateInvoicePayload } from "./validateInvoicePayload.mjs";
import { generateShipmentInvoicePdfBuffer } from "../print/shipmentInvoicePdfService.mjs";

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
export async function exportInvoicePdf(payload) {
  const started = Date.now();
  try {
    const html = buildInvoiceExportHtml(payload);
    const pdf = await renderInvoicePdfFromHtml(html);
    console.info("[export/invoice/pdf] Playwright OK", {
      invoiceNo: payload.meta?.invoiceNo,
      ms: Date.now() - started,
      bytes: pdf.length,
    });
    return pdf;
  } catch (playwrightErr) {
    console.warn("[export/invoice/pdf] Playwright failed, PDFKit fallback:", playwrightErr?.message ?? playwrightErr);
    const kitPayload = exportPayloadToPdfKit(payload);
    const pdf = await generateShipmentInvoicePdfBuffer(kitPayload);
    console.info("[export/invoice/pdf] PDFKit fallback OK", {
      invoiceNo: payload.meta?.invoiceNo,
      ms: Date.now() - started,
      bytes: pdf.length,
    });
    return pdf;
  }
}

/**
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
export async function exportInvoiceXlsx(payload) {
  const started = Date.now();
  const buf = await renderInvoiceExcelBuffer(payload);
  console.info("[export/invoice/xlsx] OK", {
    invoiceNo: payload.meta?.invoiceNo,
    ms: Date.now() - started,
    bytes: buf.length,
  });
  return buf;
}

export { validateInvoicePayload, MIME_XLSX };
