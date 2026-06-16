import { loadState } from "../stateStore.mjs";
import express from "express";
import { buildCsdValuesFromShipment } from "./csdFormValues.mjs";
import { generateCsdPdfBuffer, sendPdfResponse } from "./csdPdfService.mjs";
import { listCsdTemplateCatalog, resolveCsdTemplateForAwb } from "./csdTemplateRegistry.mjs";
import {
  decodeUploadBody,
  deleteCsdTemplateBackground,
  normalizeAwbPrefix,
  saveCsdTemplateBackground,
} from "./csdTemplateUpload.mjs";

const csdUploadJson = express.json({ limit: "15mb" });

function awbDigits(awb) {
  return String(awb ?? "").replace(/\D/g, "");
}

function findShipment(state, { id, sessionDate, awb }) {
  const rows = Array.isArray(state.rows) ? state.rows : [];
  if (id) {
    const hit = rows.find((r) => r.id === id);
    if (hit) return hit;
  }
  const key = awbDigits(awb);
  if (!key || key.length < 8) return null;
  const sd = String(sessionDate ?? "").trim();
  return (
    rows.find(
      (r) =>
        awbDigits(r.awb) === key &&
        (!sd || r.sessionDate === sd)
    ) ?? null
  );
}

function buildPdfResponseMeta(resolved) {
  return {
    awbPrefix: resolved.awbPrefix,
    airlineName: resolved.airlineName,
    templateDir: resolved.templateDir,
    templateName: resolved.templateName,
    templateStatus: resolved.status,
    renderMode: resolved.renderMode,
    useCustomTemplate: resolved.useCustomTemplate,
    paper: resolved.paper,
  };
}

/**
 * @param {import('express').Express} app
 */
export function registerCsdPrintRoutes(app) {
  app.get("/api/print/csd/catalog", (_req, res) => {
    res.json(listCsdTemplateCatalog());
  });

  app.post("/api/print/csd/template", csdUploadJson, (req, res, next) => {
    try {
      const { awbPrefix, buffer, mimeType, airlineName } = decodeUploadBody(req.body ?? {});
      const saved = saveCsdTemplateBackground(awbPrefix, buffer, mimeType, airlineName);
      res.json({ ok: true, ...saved });
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/print/csd/template/:awbPrefix", (req, res, next) => {
    try {
      const prefix = normalizeAwbPrefix(req.params.awbPrefix);
      if (!prefix) {
        res.status(400).json({ error: "Mã AWB không hợp lệ." });
        return;
      }
      const result = deleteCsdTemplateBackground(prefix);
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/print/csd/resolve", (req, res) => {
    const awb = String(req.query.awb ?? "").trim();
    if (!awb) {
      res.status(400).json({ error: "Thiếu awb." });
      return;
    }
    const resolved = resolveCsdTemplateForAwb(awb, {
      forceDefault: req.query.forceDefault === "1",
    });
    res.json({
      ...buildPdfResponseMeta(resolved),
      page: resolved.page,
    });
  });

  app.get("/api/print/pdf/csd", async (req, res, next) => {
    try {
      const id = String(req.query.id ?? "").trim();
      const sessionDate = String(req.query.sessionDate ?? "").trim();
      const awb = String(req.query.awb ?? "").trim();

      if (!id && !awb) {
        res.status(400).json({ error: "Thiếu id hoặc awb." });
        return;
      }

      const state = await loadState();
      const row = findShipment(state, { id, sessionDate, awb });
      if (!row) {
        res.status(404).json({ error: "Không tìm thấy lô hàng." });
        return;
      }
      if (!String(row.awb ?? "").trim()) {
        res.status(400).json({ error: "Lô chưa có AWB." });
        return;
      }

      const resolved = resolveCsdTemplateForAwb(row.awb, {
        forceDefault: req.query.forceDefault === "1",
      });

      const values = buildCsdValuesFromShipment(row, {
        origin: typeof req.query.origin === "string" ? req.query.origin : undefined,
        securityStatus: typeof req.query.securityStatus === "string" ? req.query.securityStatus : undefined,
        screeningMethod: typeof req.query.screeningMethod === "string" ? req.query.screeningMethod : undefined,
        issuedByName: typeof req.query.issuedByName === "string" ? req.query.issuedByName : undefined,
      });

      const pdf = await generateCsdPdfBuffer({
        values,
        bundle: resolved.bundle,
        includeBackground: req.query.bg !== "0",
      });
      const fileAwb = awbDigits(row.awb).slice(0, 20) || "csd";
      const prefix = resolved.awbPrefix ? `${resolved.awbPrefix}_` : "";
      res.setHeader("X-CSD-Template-Status", resolved.status);
      res.setHeader("X-CSD-Template-Dir", resolved.templateDir);
      sendPdfResponse(res, pdf, `CSD_${prefix}${fileAwb}.pdf`);
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/print/pdf/csd", async (req, res, next) => {
    try {
      const body = req.body ?? {};
      let row = body.shipment && typeof body.shipment === "object" ? body.shipment : null;

      if (!row) {
        const state = await loadState();
        row = findShipment(state, {
          id: String(body.id ?? "").trim(),
          sessionDate: String(body.sessionDate ?? "").trim(),
          awb: String(body.awb ?? "").trim(),
        });
      }

      if (!row) {
        res.status(404).json({ error: "Không tìm thấy lô hàng." });
        return;
      }

      const resolved = resolveCsdTemplateForAwb(row.awb, {
        forceDefault: body.forceDefault === true,
      });

      const values =
        body.values && typeof body.values === "object" && Object.keys(body.values).length
          ? body.values
          : buildCsdValuesFromShipment(row, body.options ?? {});

      const pdf = await generateCsdPdfBuffer({
        values,
        bundle: resolved.bundle,
        includeBackground: body.includeBackground !== false,
      });
      const fileAwb = awbDigits(row.awb || values.uniqueConsignmentId).slice(0, 20) || "csd";
      const prefix = resolved.awbPrefix ? `${resolved.awbPrefix}_` : "";
      sendPdfResponse(res, pdf, `CSD_${prefix}${fileAwb}.pdf`);
    } catch (e) {
      next(e);
    }
  });
}
