import { withDbClient, isDatabaseConfigured } from "./dbPool.mjs";
import { isSearchQueryTooShort, parseGlobalSearchParams, runGlobalSearch } from "./globalSearch.mjs";

export function registerGlobalSearchRoutes(app, deps = {}) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());

  app.get("/api/search", requireAuth, async (req, res, next) => {
    try {
      const parsed = parseGlobalSearchParams(req.query || {});
      if (isSearchQueryTooShort(parsed)) {
        res.json({ hits: [], from: parsed.from, to: parsed.to });
        return;
      }
      if (!isDatabaseConfigured()) {
        res.json({ hits: [], from: parsed.from, to: parsed.to });
        return;
      }
      const body = await withDbClient((client) => runGlobalSearch(client, req.query || {}));
      res.json(body);
    } catch (e) {
      next(e);
    }
  });
}
