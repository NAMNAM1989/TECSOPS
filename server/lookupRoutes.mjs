import { withDbClient } from "./dbPool.mjs";
import {
  ensureWeighSlipReady,
  lookupAirports,
  lookupCustomerAgents,
  lookupCustomerConsignees,
  lookupCustomers,
} from "./weighSlipStore.mjs";

function parseLimit(raw, fallback = 40) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
}

export function registerLookupRoutes(app) {
  app.get("/api/lookup/airports", async (req, res, next) => {
    try {
      const rows = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return lookupAirports(client, req.query.q, parseLimit(req.query.limit, 30));
      });
      res.json({
        items: rows.map((r) => ({
          iata: r.iata_code,
          name: r.name || "",
          country: r.country || "",
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/lookup/customers", async (req, res, next) => {
    try {
      const items = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return lookupCustomers(client, req.query.q, parseLimit(req.query.limit, 40));
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/lookup/customers/:customerId/consignees", async (req, res, next) => {
    try {
      const items = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return lookupCustomerConsignees(client, req.params.customerId);
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/lookup/customers/:customerId/agents", async (req, res, next) => {
    try {
      const items = await withDbClient(async (client) => {
        await ensureWeighSlipReady(client);
        return lookupCustomerAgents(client, req.params.customerId);
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });
}
