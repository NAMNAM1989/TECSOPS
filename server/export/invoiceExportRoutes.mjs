import { sendPdfResponse } from "../print/printPdfService.mjs";
import {
  exportInvoicePdf,
  exportInvoiceXlsx,
  MIME_XLSX,
  validateInvoicePayload,
} from "./invoiceExportService.mjs";
import { invoiceExportFileName } from "./invoiceExportFileName.mjs";

function sanitizeFilePart(s) {
  return String(s ?? "")
    .trim()
    .replace(/\W+/g, "")
    .slice(0, 40);
}

/**
 * POST /api/export/invoice
 * Body: { format: "pdf" | "xlsx", payload: InvoiceExportPayload }
 */
export function registerInvoiceExportRoutes(app) {
  app.post("/api/export/invoice", async (req, res, next) => {
    const started = Date.now();
    try {
      const body = req.body ?? {};
      const format = String(body.format ?? "").toLowerCase();
      const payload = body.payload;

      if (format !== "pdf" && format !== "xlsx") {
        res.status(400).json({ error: 'format phải là "pdf" hoặc "xlsx".' });
        return;
      }

      const validation = validateInvoicePayload(payload);
      if (!validation.ok) {
        res.status(400).json({ error: validation.errors.join(" ") });
        return;
      }

      const invoiceNo = sanitizeFilePart(payload.meta?.invoiceNo) || "INV";
      const awb = payload.meta?.awb ?? "";
      const declarationSeq = Number(payload.meta?.declarationSeq) || 1;
      const totalDeclarations = Number(payload.meta?.totalDeclarations) || 1;

      if (format === "pdf") {
        const pdf = await exportInvoicePdf(payload);
        console.info("[api/export/invoice] pdf done", { invoiceNo, ms: Date.now() - started });
        sendPdfResponse(
          res,
          pdf,
          invoiceExportFileName(awb, declarationSeq, totalDeclarations, "pdf"),
        );
        return;
      }

      const xlsx = await exportInvoiceXlsx(payload);
      console.info("[api/export/invoice] xlsx done", { invoiceNo, ms: Date.now() - started });
      const xlsxName = invoiceExportFileName(awb, declarationSeq, totalDeclarations, "xlsx");
      res.setHeader("Content-Type", MIME_XLSX);
      res.setHeader("Content-Disposition", `attachment; filename="${xlsxName}"`);
      res.send(xlsx);
    } catch (e) {
      console.error("[api/export/invoice]", e);
      next(e);
    }
  });
}
