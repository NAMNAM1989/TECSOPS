import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "redis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { loadState, runMutation, setRedisStateClient } from "./stateStore.mjs";
import { registerTsplRoutes } from "./tsplRoutes.mjs";

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

app.use(express.json({ limit: "2mb" }));

/** Healthcheck Railway / load balancer — luôn 200 khi process sống. */
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "tecsops" });
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
    res.status(400).json({ error: String(e.message) });
  }
});

registerTsplRoutes(app);

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
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
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    const stateClient = createClient({ url: redisUrl });

    pubClient.on("error", (err) => console.error("[redis pub]", err.message));
    subClient.on("error", (err) => console.error("[redis sub]", err.message));
    stateClient.on("error", (err) => console.error("[redis state]", err.message));

    await Promise.all([pubClient.connect(), subClient.connect(), stateClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    setRedisStateClient(stateClient);
    console.info("[redis] Socket.IO adapter + state storage (key tecsops:state)");
    try {
      await loadState();
    } catch (e) {
      console.error("[state] bootstrap Redis state failed:", e?.message ?? e);
      process.exit(1);
    }
  } else {
    setRedisStateClient(null);
    console.info("[state] file local + Socket.IO in-memory (một instance hoặc cùng volume)");
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.info(`[server] http://0.0.0.0:${PORT} (static + /api + socket.io)`);
  });
}

io.on("connection", async (socket) => {
  try {
    socket.emit("sync", await loadState());
  } catch (e) {
    console.error("[socket] initial sync", e);
  }
});

start().catch((err) => {
  console.error("[server] Khởi động thất bại:", err);
  process.exit(1);
});
