import { loadState } from "../stateStore.mjs";
import { buildCsdValuesFromShipment } from "./csdFormValues.mjs";
import { generateCsdPdfBuffer, sendPdfResponse } from "./csdPdfService.mjs";

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

/**
 * @param {import('express').Express} app
 */
export function registerCsdPrintRoutes(app) {
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

      const values = buildCsdValuesFromShipment(row, {
        origin: typeof req.query.origin === "string" ? req.query.origin : undefined,
        securityStatus: typeof req.query.securityStatus === "string" ? req.query.securityStatus : undefined,
        screeningMethod: typeof req.query.screeningMethod === "string" ? req.query.screeningMethod : undefined,
        issuedByName: typeof req.query.issuedByName === "string" ? req.query.issuedByName : undefined,
      });

      const pdf = await generateCsdPdfBuffer({ values, includeBackground: req.query.bg !== "0" });
      const fileAwb = awbDigits(row.awb).slice(0, 20) || "csd";
      sendPdfResponse(res, pdf, `CSD_${fileAwb}.pdf`);
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

      const values =
        body.values && typeof body.values === "object" && Object.keys(body.values).length
          ? body.values
          : buildCsdValuesFromShipment(row, body.options ?? {});

      const pdf = await generateCsdPdfBuffer({
        values,
        includeBackground: body.includeBackground !== false,
      });
      const fileAwb = awbDigits(row.awb || values.uniqueConsignmentId).slice(0, 20) || "csd";
      sendPdfResponse(res, pdf, `CSD_${fileAwb}.pdf`);
    } catch (e) {
      next(e);
    }
  });
}
