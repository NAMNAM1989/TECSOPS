/**
 * API export ổn định cho app ngoài:
 *   GET /api/v1/export/meta
 *   GET /api/v1/export/shipments
 *   GET /api/v1/export/shipments/:id
 *   GET /api/v1/export/customers
 *
 * Auth: Bearer TECSOPS_APP_TOKEN hoặc cookie phiên (cùng gate app).
 * Đọc thẳng Postgres — không đi qua blob /api/state.
 */
import {
  buildExportEnvelope,
  etagMatches,
  exportEtag,
  parseExportView,
} from "./exportContract.mjs";
import {
  peekExportStateVersion,
  queryExportCustomers,
  queryExportShipmentById,
  queryExportShipments,
} from "./exportStore.mjs";

function applyExportCors(req, res) {
  const raw = process.env.CORS_ORIGINS?.trim() || process.env.EXPORT_CORS_ORIGINS?.trim();
  if (!raw) return;
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = String(req.headers.origin || "");
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, If-None-Match, X-TECSOPS-Token",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

function setExportCacheHeaders(res, stateVersion) {
  const etag = exportEtag(stateVersion);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("X-TECSOPS-State-Version", String(stateVersion));
  return etag;
}

function maybeNotModified(req, res, stateVersion) {
  const etag = setExportCacheHeaders(res, stateVersion);
  if (etagMatches(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return true;
  }
  return false;
}

function sendExportError(res, err) {
  const status = Number(err?.statusCode || err?.status) || 500;
  res.status(status).json({
    ok: false,
    error: String(err?.message || "Export failed"),
    code: err?.code || (status >= 500 ? "EXPORT_INTERNAL" : "EXPORT_ERROR"),
  });
}

/**
 * @param {import('express').Express} app
 * @param {{ requireAuth: import('express').RequestHandler }} deps
 */
export function registerExportRoutes(app, deps = {}) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());

  app.options("/api/v1/export/*", (req, res) => {
    applyExportCors(req, res);
    res.status(204).end();
  });

  app.get("/api/v1/export/meta", requireAuth, async (req, res) => {
    applyExportCors(req, res);
    try {
      const stateVersion = await peekExportStateVersion();
      if (maybeNotModified(req, res, stateVersion)) return;
      res.json({
        ok: true,
        apiVersion: "v1",
        schemaVersion: 1,
        resource: "meta",
        stateVersion,
        generatedAt: new Date().toISOString(),
        endpoints: {
          shipments: "/api/v1/export/shipments",
          shipmentById: "/api/v1/export/shipments/:id",
          customers: "/api/v1/export/customers",
        },
        filters: {
          shipments: ["sessionDate", "warehouse", "status", "awb", "id", "view", "limit", "cursor"],
          customers: ["q", "code", "id", "limit"],
        },
        warehouses: ["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"],
        views: ["core", "full"],
      });
    } catch (err) {
      console.error("[api/v1/export/meta]", err);
      sendExportError(res, err);
    }
  });

  app.get("/api/v1/export/shipments", requireAuth, async (req, res) => {
    applyExportCors(req, res);
    try {
      const stateVersion = await peekExportStateVersion();
      if (maybeNotModified(req, res, stateVersion)) return;

      const result = await queryExportShipments({
        sessionDate: req.query.sessionDate ?? req.query.session_date,
        warehouse: req.query.warehouse,
        status: req.query.status,
        awb: req.query.awb,
        id: req.query.id,
        view: req.query.view,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });

      res.json(
        buildExportEnvelope({
          resource: "shipments",
          stateVersion,
          query: result.query,
          items: result.shipments,
          itemKey: "shipments",
          nextCursor: result.nextCursor,
        }),
      );
    } catch (err) {
      console.error("[api/v1/export/shipments]", err);
      sendExportError(res, err);
    }
  });

  app.get("/api/v1/export/shipments/:id", requireAuth, async (req, res) => {
    applyExportCors(req, res);
    try {
      const stateVersion = await peekExportStateVersion();
      if (maybeNotModified(req, res, stateVersion)) return;

      const view = parseExportView(req.query.view);
      const shipment = await queryExportShipmentById(req.params.id, view);
      if (!shipment) {
        res.status(404).json({
          ok: false,
          error: "Không tìm thấy shipment.",
          code: "EXPORT_SHIPMENT_NOT_FOUND",
        });
        return;
      }

      res.json(
        buildExportEnvelope({
          resource: "shipment",
          stateVersion,
          query: { id: String(req.params.id), view },
          items: [shipment],
          itemKey: "shipments",
          nextCursor: null,
        }),
      );
    } catch (err) {
      console.error("[api/v1/export/shipments/:id]", err);
      sendExportError(res, err);
    }
  });

  app.get("/api/v1/export/customers", requireAuth, async (req, res) => {
    applyExportCors(req, res);
    try {
      const stateVersion = await peekExportStateVersion();
      if (maybeNotModified(req, res, stateVersion)) return;

      const result = await queryExportCustomers({
        q: req.query.q,
        code: req.query.code,
        id: req.query.id,
        limit: req.query.limit,
      });

      res.json(
        buildExportEnvelope({
          resource: "customers",
          stateVersion,
          query: result.query,
          items: result.customers,
          itemKey: "customers",
          nextCursor: null,
        }),
      );
    } catch (err) {
      console.error("[api/v1/export/customers]", err);
      sendExportError(res, err);
    }
  });
}
