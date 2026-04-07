import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "redis";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { loadState, runMutation, setRedisStateClient } from "./stateStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  path: "/socket.io/",
  cors: { origin: true },
});

app.use(express.json({ limit: "2mb" }));

app.get("/api/state", async (_req, res) => {
  try {
    res.json(await loadState());
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/mutation", async (req, res) => {
  try {
    const next = await runMutation(req.body);
    io.emit("sync", next);
    res.json(next);
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) return next();
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next(err);
  });
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
    console.log("[redis] Socket.IO adapter + state storage (key tecsops:state)");
  } else {
    setRedisStateClient(null);
    console.log("[state] file local + Socket.IO in-memory (một instance hoặc cùng volume)");
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] http://0.0.0.0:${PORT} (static + /api + socket.io)`);
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
