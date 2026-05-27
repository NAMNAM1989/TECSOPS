import { withDbClient } from "../dbPool.mjs";
import {
  ensurePrintTemplateReady,
  listPrintProfiles,
  listPrintTemplateFields,
  listPrintTemplates,
  loadPrintJobContext,
  replacePrintTemplateFields,
  updatePrintProfileMeta,
} from "./printTemplateStore.mjs";
import { generateScscWeighPdfBuffer, sendPdfResponse } from "./printPdfService.mjs";
import { convertInvoiceXlsxToPdf } from "./convertInvoiceXlsxToPdf.mjs";

function compactValues(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    out[k] = String(v ?? "");
  }
  return out;
}

/**
 * Invoice PDF — không cần Postgres (luôn bật khi chạy server).
 */
export function registerShipmentInvoicePdfRoute(app) {
/**
 * @deprecated Dùng POST /api/export/invoice với JSON payload.
 * POST /api/print/pdf/shipment-invoice
   * Body JSON: { xlsxBase64, invoiceNo?, awb? } — PDF từ file Excel đã điền mẫu INV.xlsx.
   */
  app.post("/api/print/pdf/shipment-invoice", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const b64 = typeof body.xlsxBase64 === "string" ? body.xlsxBase64.trim() : "";
      if (!b64) {
        res.status(400).json({
          error:
            "Thiếu xlsxBase64 — client gửi file Excel đã điền từ mẫu INV.xlsx để chuyển PDF.",
        });
        return;
      }
      const xlsxBuffer = Buffer.from(b64, "base64");
      if (xlsxBuffer.length < 100) {
        res.status(400).json({ error: "xlsxBase64 không hợp lệ." });
        return;
      }

      const pdf = await convertInvoiceXlsxToPdf(xlsxBuffer);
      const invoiceNo =
        typeof body.invoiceNo === "string" ? body.invoiceNo.trim().replace(/\W+/g, "") : "INV";
      const awbPart = String(body.awb ?? "AWB")
        .replace(/\W+/g, "")
        .slice(0, 20);
      sendPdfResponse(res, pdf, `INV_${invoiceNo || "INV"}_${awbPart || "AWB"}.pdf`);
    } catch (e) {
      next(e);
    }
  });
}

export function registerPrintPdfRoutes(app) {
  app.get("/api/print/templates", async (_req, res, next) => {
    try {
      const items = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return listPrintTemplates(client);
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/print/profiles", async (req, res, next) => {
    try {
      const templateCode = typeof req.query.template === "string" ? req.query.template.trim() : "";
      const items = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return listPrintProfiles(client, { templateCode: templateCode || undefined });
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/print/profiles/:profileId/fields", async (req, res, next) => {
    try {
      const fields = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return listPrintTemplateFields(client, req.params.profileId);
      });
      res.json({ profileId: req.params.profileId, fields });
    } catch (e) {
      next(e);
    }
  });

  app.put("/api/print/profiles/:profileId/fields", async (req, res, next) => {
    try {
      const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
      const profileMeta =
        req.body?.profile && typeof req.body.profile === "object" ? req.body.profile : null;
      await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        await client.query("BEGIN");
        try {
          await replacePrintTemplateFields(client, req.params.profileId, fields);
          if (profileMeta) {
            await updatePrintProfileMeta(client, req.params.profileId, {
              offsetXMm: profileMeta.offsetXMm,
              offsetYMm: profileMeta.offsetYMm,
              scaleX: profileMeta.scaleX,
              scaleY: profileMeta.scaleY,
            });
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
      res.json({ ok: true, profileId: req.params.profileId, count: fields.length });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/print/pdf/scsc-weigh
   * Body: { profileId?, templateCode?, values: Record<string,string>, includeBackground?: boolean }
   */
  app.post("/api/print/pdf/scsc-weigh", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const values = compactValues(body.values);
      if (Object.keys(values).length === 0) {
        res.status(400).json({ error: "Thiếu values — gửi map field_key → text." });
        return;
      }

      const pdf = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return generateScscWeighPdfBuffer(client, {
          profileId: typeof body.profileId === "string" ? body.profileId.trim() : undefined,
          templateCode: typeof body.templateCode === "string" ? body.templateCode.trim() : "scsc-weigh-a4",
          values,
          renderFields: Array.isArray(body.renderFields) ? body.renderFields : undefined,
          printTransform:
            body.printTransform && typeof body.printTransform === "object" ? body.printTransform : undefined,
          includeBackground: Boolean(body.includeBackground),
        });
      });

      const awb = (values.mawb || values.awb || "scsc").replace(/\W+/g, "").slice(0, 20);
      sendPdfResponse(res, pdf, `scsc-weigh-${awb || "slip"}.pdf`);
    } catch (e) {
      next(e);
    }
  });

  /** GET preview — query ?profileId=&mawb=… hoặc truyền values qua POST khuyến nghị. */
  app.get("/api/print/pdf/scsc-weigh/preview", async (req, res, next) => {
    try {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId.trim() : undefined;
      const values = compactValues({
        mawb: req.query.mawb,
        consignee: req.query.consignee,
        destination: req.query.dest,
      });
      const pdf = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return generateScscWeighPdfBuffer(client, {
          profileId,
          values,
          includeBackground: req.query.bg === "1",
        });
      });
      sendPdfResponse(res, pdf, "scsc-weigh-preview.pdf");
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/print/job-context", async (req, res, next) => {
    try {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId.trim() : undefined;
      const templateCode =
        typeof req.query.template === "string" ? req.query.template.trim() : "scsc-weigh-a4";
      const ctx = await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        return loadPrintJobContext(client, { profileId, templateCode });
      });
      res.json(ctx);
    } catch (e) {
      next(e);
    }
  });
}
