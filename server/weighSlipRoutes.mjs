import { withDbClient } from "./dbPool.mjs";
import {
  createWeighSlip,
  duplicateWeighSlip,
  ensureWeighSlipReady,
  getWeighSlipById,
  listWeighSlips,
  updateWeighSlip,
} from "./weighSlipStore.mjs";

export function registerWeighSlipRoutes(app) {
  app.get("/api/weigh-slips", async (req, res, next) => {
    try {
      const items = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return listWeighSlips(client, {
          status: req.query.status,
          q: req.query.q,
          limit: req.query.limit,
        });
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/weigh-slips/:id", async (req, res, next) => {
    try {
      const item = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return getWeighSlipById(client, req.params.id);
      });
      if (!item) {
        res.status(404).json({ error: "Không tìm thấy phiếu cân" });
        return;
      }
      res.json(item);
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/weigh-slips", async (req, res, next) => {
    try {
      const item = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        await client.query("BEGIN");
        try {
          const created = await createWeighSlip(client, req.body ?? {});
          await client.query("COMMIT");
          return created;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
      res.status(201).json(item);
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/weigh-slips/:id", async (req, res, next) => {
    try {
      const item = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        await client.query("BEGIN");
        try {
          const updated = await updateWeighSlip(client, req.params.id, req.body ?? {});
          await client.query("COMMIT");
          return updated;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
      if (!item) {
        res.status(404).json({ error: "Không tìm thấy phiếu cân" });
        return;
      }
      res.json(item);
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/weigh-slips/:id/duplicate", async (req, res, next) => {
    try {
      const item = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        await client.query("BEGIN");
        try {
          const dup = await duplicateWeighSlip(client, req.params.id);
          await client.query("COMMIT");
          return dup;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
      if (!item) {
        res.status(404).json({ error: "Không tìm thấy phiếu cân" });
        return;
      }
      res.status(201).json(item);
    } catch (e) {
      next(e);
    }
  });
}
