import "./loadEnv.mjs";
import express from "express";
import compression from "compression";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  loadState,
  peekStateVersion,
  runBatchMutations,
  runMutation,
  setPostgresStateStore,
} from "./stateStore.mjs";
import { createPostgresStateStore } from "./postgresStateStore.mjs";
import { registerLookupRoutes } from "./lookupRoutes.mjs";
import { registerScscH21Routes } from "./scscH21Routes.mjs";
import { registerTcsH21Routes } from "./tcsH21Routes.mjs";
import { getDbPool, isDatabaseConfigured } from "./dbPool.mjs";
import { registerSheetsRoutes } from "./sheets/sheetsRoutes.mjs";
import {
  applySecurityHeaders,
  createMutationRateLimit,
  mutationErrorPayload,
} from "./httpSecurity.mjs";
import { createAppAuth } from "./appAuth.mjs";
import {
  emitScopedSync,
  mutationsTouchCustomers,
  mutationTouchesCustomers,
  parseStateScopeFromHeaders,
  parseStateScopeFromQuery,
  projectAppState,
} from "./stateScope.mjs";
import {
  attachDbSyncedAt,
  buildSyncMeta,
  loadNamnamlogisticsSyncedAtSnapshot,
} from "./namnamlogisticsSyncedAt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const MAX_BATCH_MUTATIONS = 500;

function resolveRequestStateScope(req) {
  const fromQuery = parseStateScopeFromQuery(req.query || {});
  if (fromQuery.full || fromQuery.sessionDate) return fromQuery;
  return parseStateScopeFromHeaders(req.headers || {});
}

/** Client gửi version đang có — nếu khớp, bỏ qua load full snapshot. */
function resolveSinceVersion(req) {
  const raw =
    req.query?.sinceVersion ??
    req.query?.since_version ??
    req.headers?.["x-tecsops-since-version"] ??
    req.headers?.["X-TECSOPS-Since-Version"];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function projectStateForClient(state, req) {
  const withSync = await attachDbSyncedAt(state);
  return projectAppState(withSync, resolveRequestStateScope(req));
}

const app = express();
app.set("trust proxy", 1);
app.use(applySecurityHeaders({ isProduction }));
app.use(compression());
const httpServer = createServer(app);
const appAuth = createAppAuth({ isProduction });

/**
 * CORS cho Socket.IO: production mặc định same-origin (`false`);
 * nếu cần domain khác — set `CORS_ORIGINS` (comma-separated).
 */
function socketIoCorsOptions() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (origins.length) return { origin: origins };
  }
  if (isProduction) return { origin: false };
  return { origin: true };
}

const io = new Server(httpServer, {
  path: "/socket.io/",
  cors: socketIoCorsOptions(),
});
io.use(appAuth.socketMiddleware);

app.use(express.json({ limit: "12mb" }));
appAuth.registerRoutes(app);

/** Healthcheck Railway / load balancer — xác nhận cả process và Postgres. */
app.get("/api/health", async (_req, res) => {
  try {
    const pool = getDbPool();
    if (!pool) throw new Error("DATABASE_URL is not configured");
    await pool.query("SELECT 1");
    res.status(200).json({
      ok: true,
      service: "tecsops",
      storage: { postgres: true },
    });
  } catch (e) {
    console.error("[api/health]", e?.message ?? e);
    res.status(503).json({
      ok: false,
      service: "tecsops",
      storage: { postgres: false },
    });
  }
});

app.get("/api/state", appAuth.requireAuth, async (req, res) => {
  try {
    const sinceVersion = resolveSinceVersion(req);
    if (sinceVersion != null) {
      try {
        const current = await peekStateVersion();
        if (current === sinceVersion) {
          res.json({ version: current, unchanged: true });
          return;
        }
      } catch {
        /* peek thất bại → load đầy đủ */
      }
    }
    const scope = resolveRequestStateScope(req);
    const full =
      scope.full
        ? await loadState()
        : await loadState({
            sessionDate: scope.sessionDate || undefined,
          });
    res.json(await projectStateForClient(full, req));
  } catch (e) {
    console.error("[api/state]", e);
    res.status(500).json({
      error: isProduction ? "Failed to load state" : String(e?.message ?? e),
    });
  }
});

/** Thin SoT: aggregates mặc định; `?detail=1` kèm mảng lots/customers (payload lớn). */
app.get("/api/sync-meta", appAuth.requireAuth, async (req, res) => {
  try {
    const snapshot = await loadNamnamlogisticsSyncedAtSnapshot();
    const detail =
      req.query?.detail === "1" ||
      req.query?.detail === "true" ||
      req.query?.full === "1";
    const body = {
      ok: true,
      ...buildSyncMeta(snapshot),
    };
    if (detail) {
      body.lots = (snapshot.lots ?? []).map((l) => ({
        awb: l.awb ?? null,
        awb_norm: l.awb_norm ?? null,
        warehouse: l.warehouse ?? null,
        session_date: l.session_date ?? l.sessionDate ?? null,
        synced_at: l.synced_at ?? l.syncedAt ?? null,
      }));
      body.customers = (snapshot.customers ?? []).map((c) => ({
        code: c.code ?? null,
        synced_at: c.synced_at ?? c.syncedAt ?? null,
      }));
    }
    res.json(body);
  } catch (e) {
    console.error("[api/sync-meta]", e);
    res.status(500).json({
      ok: false,
      error: isProduction ? "Failed to load sync meta" : String(e?.message ?? e),
    });
  }
});

const mutationRateLimit = createMutationRateLimit();

app.post("/api/mutation", appAuth.requireAuth, mutationRateLimit, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const next = await runMutation(body);
    const forClient = await attachDbSyncedAt(next);
    await emitScopedSync(io, forClient, {
      omitCustomers: !mutationTouchesCustomers(body),
    });
    res.json(projectAppState(forClient, resolveRequestStateScope(req)));
  } catch (e) {
    console.error("[api/mutation]", e);
    res.status(400).json(
      mutationErrorPayload(e, {
        isProduction,
        fallback: "Không thể cập nhật dữ liệu.",
      }),
    );
  }
});

/**
 * Nhiều mutation trong một request — một lần khóa Postgres, một lần broadcast.
 */
app.post("/api/mutations", appAuth.requireAuth, mutationRateLimit, async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list) || list.some((m) => !m || typeof m !== "object")) {
      res.status(400).json({ error: "Body phải là mảng mutation" });
      return;
    }
    if (list.length > MAX_BATCH_MUTATIONS) {
      res.status(400).json({ error: `Tối đa ${MAX_BATCH_MUTATIONS} mutation mỗi lần` });
      return;
    }
    const next = await runBatchMutations(list);
    const forClient = await attachDbSyncedAt(next);
    await emitScopedSync(io, forClient, {
      omitCustomers: !mutationsTouchCustomers(list),
    });
    res.json(projectAppState(forClient, resolveRequestStateScope(req)));
  } catch (e) {
    console.error("[api/mutations]", e);
    res.status(400).json(
      mutationErrorPayload(e, {
        isProduction,
        fallback: "Không thể cập nhật dữ liệu hàng loạt.",
      }),
    );
  }
});

registerSheetsRoutes(app, { io, requireAuth: appAuth.requireAuth });
console.info("[api] sheets (BOOK Hằng Ngày)");
// Gemini /api/ai đã gỡ (A3). Railway có thể xóa GEMINI_*.

registerScscH21Routes(app, { requireAuth: appAuth.requireAuth });
console.info("[api] scsc-h21 catalog");
registerTcsH21Routes(app, { requireAuth: appAuth.requireAuth });
console.info("[api] tcs-h21 catalog");

if (isDatabaseConfigured()) {
  registerLookupRoutes(app, { requireAuth: appAuth.requireAuth });
  console.info("[api] lookup (Postgres)");
}

const distDir = path.join(__dirname, "..", "dist");
app.use(
  express.static(distDir, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || path.basename(filePath) === "index.html") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/socket.io")
  ) {
    return next();
  }
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use((err, _req, res, _next) => {
  console.error("[http]", err);
  const status = Number(err?.statusCode || err?.status) || 500;
  const safe = isProduction
    ? err?.type === "entity.parse.failed"
      ? "Invalid JSON body"
      : status >= 500
        ? "Internal Server Error"
        : String(err?.message || "Request failed")
    : String(err?.message || "Request failed");
  res.status(status).json({ error: safe });
});

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error(
      "[FATAL] Thiếu DATABASE_URL. Thêm Postgres (local hoặc Railway) rồi khởi động lại."
    );
    process.exit(1);
  }

  setPostgresStateStore(createPostgresStateStore(databaseUrl));
  console.info("[postgres] state storage (table app_state)");

  try {
    await loadState();
  } catch (e) {
    console.error("[state] bootstrap state failed:", e?.message ?? e);
    process.exit(1);
  }

  console.info("[socket] Socket.IO in-memory (Postgres state; single app replica)");

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.info(`[server] http://0.0.0.0:${PORT} (static + /api + socket.io)`);
  });
}

io.on("connection", async (socket) => {
  try {
    const scope = parseStateScopeFromQuery(socket.handshake.query || {});
    socket.data.stateScope = scope;
    socket.on("setStateScope", (payload) => {
      const nextScope = parseStateScopeFromQuery(payload || {});
      socket.data.stateScope = nextScope;
    });
    const clientVersion = parseInt(socket.handshake.query?.v || "0", 10);
    const initial =
      scope.full || !scope.sessionDate
        ? await loadState()
        : await loadState({ sessionDate: scope.sessionDate });
    if (initial.version > clientVersion) {
      socket.emit("sync", projectAppState(initial, scope));
    } else {
      console.info(`[socket] client already has latest version ${clientVersion}. Sync bypassed.`);
    }
  } catch (e) {
    console.error("[socket] initial sync", e);
  }
});

start().catch((err) => {
  console.error("[server] Khởi động thất bại:", err);
  process.exit(1);
});
