import { withDbClient } from "../dbPool.mjs";
import {
  ensurePrintTemplateReady,
  listPrintProfiles,
  listPrintTemplateFields,
  listPrintTemplates,
  loadPrintJobContext,
  replacePrintTemplateFields,
} from "./printTemplateStore.mjs";
import { generateScscWeighPdfBuffer, sendPdfResponse } from "./printPdfService.mjs";

function compactValues(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string") continue;
    out[k] = String(v ?? "");
  }
  return out;
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
      await withDbClient(async (client) => {
        await ensurePrintTemplateReady(client);
        await client.query("BEGIN");
        try {
          await replacePrintTemplateFields(client, req.params.profileId, fields);
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
