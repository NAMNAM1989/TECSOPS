import "./loadEnv.mjs";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  loadState,
  runMutation,
  setPostgresStateStore,
} from "./stateStore.mjs";
import { createPostgresStateStore } from "./postgresStateStore.mjs";
import { registerLookupRoutes } from "./lookupRoutes.mjs";
import { getDbPool, isDatabaseConfigured } from "./dbPool.mjs";
import { registerSheetsRoutes } from "./sheets/sheetsRoutes.mjs";
import { registerTcsAgentProxy } from "./tcsAgentProxy.mjs";
import { registerTcsDesktopProxy } from "./tcsDesktopProxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

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

// Proxy agent TRƯỚC express.json — giữ raw body cho POST /jobs, /esid/*
registerTcsAgentProxy(app);
// noVNC desktop (Xvfb) — HTTP + WebSocket upgrade trên cùng PORT
registerTcsDesktopProxy(app, httpServer);

app.use(express.json({ limit: "2mb" }));

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

app.get("/api/state", async (_req, res) => {
  try {
    res.json(await loadState());
  } catch (e) {
    console.error("[api/state]", e);
    res.status(500).json({
      error: isProduction ? "Failed to load state" : String(e?.message ?? e),
    });
  }
});

app.post("/api/mutation", async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const next = await runMutation(body);
    io.emit("sync", next);
    res.json(next);
  } catch (e) {
    console.error("[api/mutation]", e);
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    res.status(400).json({ error: msg || "Mutation failed" });
  }
});

registerSheetsRoutes(app, { io });

if (isDatabaseConfigured()) {
  registerLookupRoutes(app);
  console.info("[api] lookup (Postgres)");
}

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/socket.io") ||
    req.path.startsWith("/tcs-agent")
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
  const safe =
    isProduction && status >= 500
      ? "Internal Server Error"
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
    const initial = await loadState();
    socket.emit("sync", initial);
  } catch (e) {
    console.error("[socket] initial sync", e);
  }
});

start().catch((err) => {
  console.error("[server] Khởi động thất bại:", err);
  process.exit(1);
});
