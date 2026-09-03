import { withDbClient } from "./dbPool.mjs";
import {
  createScscH21Goods,
  createScscH21Stamp,
  deleteScscH21Goods,
  deleteScscH21Stamp,
  ensureScscH21CatalogSchema,
  getScscH21Goods,
  listScscH21Goods,
  listScscH21Stamps,
  replaceAllScscH21Goods,
  seedScscH21CatalogIfEmpty,
  updateScscH21Goods,
  updateScscH21Stamp,
  upsertScscH21GoodsBulk,
} from "./scscH21Catalog.mjs";
import {
  catalogItemFromExcelRow,
  clampScscH21Catalog,
} from "../shared/scscH21CatalogNormalize.mjs";

async function withCatalog(fn) {
  return withDbClient(async (client) => {
    await ensureScscH21CatalogSchema(client);
    await seedScscH21CatalogIfEmpty(client);
    return fn(client);
  });
}

function sendError(res, e) {
  const status = Number(e?.statusCode) || 500;
  res.status(status).json({
    error: String(e?.message || e || "Lỗi catalog SCSC H21"),
    code: e?.code || "SCSC_H21_CATALOG_ERROR",
  });
}

export function registerScscH21Routes(app, deps = {}) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());

  app.get("/api/scsc-h21/goods", requireAuth, async (req, res) => {
    try {
      const items = await withCatalog((client) =>
        listScscH21Goods(client, {
          q: req.query.q,
          activeOnly: String(req.query.activeOnly ?? "1") !== "0",
          limit: Number(req.query.limit) || 500,
        })
      );
      res.json({ warehouseScope: "SCSC", items });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/scsc-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => getScscH21Goods(client, req.params.id));
      if (!item) {
        res.status(404).json({ error: "Không tìm thấy mặt hàng", code: "NOT_FOUND" });
        return;
      }
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/scsc-h21/goods", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => createScscH21Goods(client, req.body || {}));
      res.status(201).json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/scsc-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) =>
        updateScscH21Goods(client, req.params.id, req.body || {})
      );
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/scsc-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const result = await withCatalog((client) => deleteScscH21Goods(client, req.params.id));
      res.json({ ok: true, ...result });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** Import/merge nhiều mặt hàng (JSON array hoặc { items: [] }). */
  app.post("/api/scsc-h21/goods/import", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const list = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
      const result = await withCatalog((client) => upsertScscH21GoodsBulk(client, list));
      res.json({
        ok: true,
        created: result.created,
        updated: result.updated,
        count: result.items.length,
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** Thay toàn bộ catalog (cẩn thận). */
  app.put("/api/scsc-h21/goods", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const list = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
      const items = await withCatalog((client) => replaceAllScscH21Goods(client, list));
      res.json({ warehouseScope: "SCSC", items, count: items.length });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/scsc-h21/stamps", requireAuth, async (_req, res) => {
    try {
      const items = await withCatalog((client) => listScscH21Stamps(client));
      res.json({ warehouseScope: "SCSC", items });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/scsc-h21/stamps", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => createScscH21Stamp(client, req.body || {}));
      res.status(201).json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/scsc-h21/stamps/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) =>
        updateScscH21Stamp(client, req.params.id, req.body || {})
      );
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/scsc-h21/stamps/:id", requireAuth, async (req, res) => {
    try {
      const result = await withCatalog((client) => deleteScscH21Stamp(client, req.params.id));
      res.json({ ok: true, ...result });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** Helper: chuẩn hóa hàng từ payload Excel đã parse phía client. */
  app.post("/api/scsc-h21/goods/normalize-rows", requireAuth, async (req, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const items = clampScscH21Catalog(rows.map((r) => catalogItemFromExcelRow(r)).filter(Boolean));
      res.json({ items });
    } catch (e) {
      sendError(res, e);
    }
  });
}
