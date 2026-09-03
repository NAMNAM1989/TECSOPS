import { withDbClient } from "./dbPool.mjs";
import {
  createTcsH21Goods,
  createTcsH21Stamp,
  deleteTcsH21Goods,
  deleteTcsH21Stamp,
  ensureTcsH21CatalogSchema,
  getTcsH21Goods,
  listTcsH21Goods,
  listTcsH21Stamps,
  replaceAllTcsH21Goods,
  seedTcsH21CatalogIfEmpty,
  updateTcsH21Goods,
  updateTcsH21Stamp,
  upsertTcsH21GoodsBulk,
} from "./tcsH21Catalog.mjs";
import {
  catalogItemFromExcelRow,
  clampTcsH21Catalog,
} from "../shared/tcsH21CatalogNormalize.mjs";

async function withCatalog(fn) {
  return withDbClient(async (client) => {
    await ensureTcsH21CatalogSchema(client);
    await seedTcsH21CatalogIfEmpty(client);
    return fn(client);
  });
}

function sendError(res, e) {
  const status = Number(e?.statusCode) || 500;
  res.status(status).json({
    error: String(e?.message || e || "Lỗi catalog TCS H21"),
    code: e?.code || "TCS_H21_CATALOG_ERROR",
  });
}

export function registerTcsH21Routes(app, deps = {}) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());

  app.get("/api/tcs-h21/goods", requireAuth, async (req, res) => {
    try {
      const items = await withCatalog((client) =>
        listTcsH21Goods(client, {
          q: req.query.q,
          activeOnly: String(req.query.activeOnly ?? "1") !== "0",
          limit: Number(req.query.limit) || 500,
        })
      );
      res.json({ warehouseScope: "TCS", items });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/tcs-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => getTcsH21Goods(client, req.params.id));
      if (!item) {
        res.status(404).json({ error: "Không tìm thấy mặt hàng", code: "NOT_FOUND" });
        return;
      }
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/tcs-h21/goods", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => createTcsH21Goods(client, req.body || {}));
      res.status(201).json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/tcs-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) =>
        updateTcsH21Goods(client, req.params.id, req.body || {})
      );
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/tcs-h21/goods/:id", requireAuth, async (req, res) => {
    try {
      const result = await withCatalog((client) => deleteTcsH21Goods(client, req.params.id));
      res.json({ ok: true, ...result });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** Import/merge nhiều mặt hàng (JSON array hoặc { items: [] }). */
  app.post("/api/tcs-h21/goods/import", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const list = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
      const result = await withCatalog((client) => upsertTcsH21GoodsBulk(client, list));
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
  app.put("/api/tcs-h21/goods", requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const list = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
      const items = await withCatalog((client) => replaceAllTcsH21Goods(client, list));
      res.json({ warehouseScope: "TCS", items, count: items.length });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get("/api/tcs-h21/stamps", requireAuth, async (_req, res) => {
    try {
      const items = await withCatalog((client) => listTcsH21Stamps(client));
      res.json({ warehouseScope: "TCS", items });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post("/api/tcs-h21/stamps", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) => createTcsH21Stamp(client, req.body || {}));
      res.status(201).json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.patch("/api/tcs-h21/stamps/:id", requireAuth, async (req, res) => {
    try {
      const item = await withCatalog((client) =>
        updateTcsH21Stamp(client, req.params.id, req.body || {})
      );
      res.json({ item });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete("/api/tcs-h21/stamps/:id", requireAuth, async (req, res) => {
    try {
      const result = await withCatalog((client) => deleteTcsH21Stamp(client, req.params.id));
      res.json({ ok: true, ...result });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** Helper: chuẩn hóa hàng từ payload Excel đã parse phía client. */
  app.post("/api/tcs-h21/goods/normalize-rows", requireAuth, async (req, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const items = clampTcsH21Catalog(rows.map((r) => catalogItemFromExcelRow(r)).filter(Boolean));
      res.json({ items });
    } catch (e) {
      sendError(res, e);
    }
  });
}
