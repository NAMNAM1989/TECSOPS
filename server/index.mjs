import "./loadEnv.mjs";
import express from "express";
import compression from "compression";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { Server } from "socket.io";
import {
  loadState,
  runBatchMutations,
  runMutation,
  setPostgresStateStore,
} from "./stateStore.mjs";
import { createPostgresStateStore } from "./postgresStateStore.mjs";
import { registerLookupRoutes } from "./lookupRoutes.mjs";
import { getDbPool, isDatabaseConfigured } from "./dbPool.mjs";
import { registerSheetsRoutes } from "./sheets/sheetsRoutes.mjs";
import { registerTcsAgentProxy } from "./tcsAgentProxy.mjs";
import { registerPortalJobRoutes } from "./portalJobs.mjs";
import { registerEcargoVctRoutes } from "./ecargoVctRoutes.mjs";
import { registerAiRoutes } from "./ai/aiRoutes.mjs";
import { recordMutationEventSafe } from "./ai/opsAiEventsStore.mjs";
import {
  applySecurityHeaders,
  createRateLimit,
  createMutationRateLimit,
  mutationErrorPayload,
} from "./httpSecurity.mjs";
import { createAppAuth } from "./appAuth.mjs";
import {
  emitScopedSync,
  parseStateScopeFromHeaders,
  parseStateScopeFromQuery,
  projectAppState,
} from "./stateScope.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const MAX_BATCH_MUTATIONS = 500;

function resolveRequestStateScope(req) {
  const fromQuery = parseStateScopeFromQuery(req.query || {});
  if (fromQuery.full || fromQuery.sessionDate) return fromQuery;
  return parseStateScopeFromHeaders(req.headers || {});
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

// Proxy agent TRƯỚC express.json — giữ raw body cho POST /jobs, /esid/*
registerTcsAgentProxy(app);

// PDF base64 từ worker portal (~0.5–2MB) — nới limit
app.use(express.json({ limit: "12mb" }));
appAuth.registerRoutes(app);
registerPortalJobRoutes(app);

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

const CHROME_EXTENSION_PACKAGES = [
  {
    id: "tecs-tcs",
    label: "TECS-TCS",
    title: "TECSOPS — Kho TECS-TCS ESID",
    warehouse: "TECS-TCS",
    manifestRel: path.join("chrome-extension", "manifest.json"),
    stableZipName: "tecsops-chrome-extension.zip",
    versionedPrefix: "tecsops-chrome-extension",
    installExtra: [
      "Ext này chỉ ESID kho TECS-TCS",
      "eCargo SCSC → Ext SCSC riêng · kho TCS → Ext TCS (Chrome profile khác)",
    ],
  },
  {
    id: "tcs",
    label: "TCS",
    title: "TECSOPS — Kho TCS ESID",
    warehouse: "TCS",
    manifestRel: path.join("chrome-extension-tcs", "manifest.json"),
    stableZipName: "tecsops-chrome-extension-tcs.zip",
    versionedPrefix: "tecsops-chrome-extension-tcs",
    installExtra: [
      "Ext này chỉ ESID kho TCS — Chrome profile riêng với Ext TECS-TCS",
      "Trên Ops chọn kho TCS → Đăng nhập / Quét / Điền",
    ],
  },
  {
    id: "scsc",
    label: "SCSC",
    title: "TECSOPS — Kho SCSC eCargo",
    warehouse: "SCSC",
    manifestRel: path.join("chrome-extension-scsc", "manifest.json"),
    stableZipName: "tecsops-chrome-extension-scsc.zip",
    versionedPrefix: "tecsops-chrome-extension-scsc",
    installExtra: [
      "Ext này chỉ eCargo SCSC (VCT / OTP / QR)",
      "Trên Ops chọn kho SCSC → Đăng ký eCargo",
    ],
  },
];

function extensionDownloadsDirs() {
  return [
    path.join(__dirname, "..", "public", "downloads"),
    path.join(__dirname, "..", "dist", "downloads"),
  ];
}

function resolveChromeExtensionPackage({
  manifestRel,
  stableZipName,
  versionedPrefix,
  installExtra = [],
  id,
  label,
  title,
  warehouse,
}) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", manifestRel), "utf8"),
  );
  const version = String(manifest.version || "").trim();
  const versionedName = version
    ? `${versionedPrefix}-v${version}.zip`
    : `${stableZipName}`;
  let hasVersioned = false;
  let hasStable = false;
  for (const downloadsDir of extensionDownloadsDirs()) {
    if (version && fs.existsSync(path.join(downloadsDir, versionedName))) {
      hasVersioned = true;
    }
    if (fs.existsSync(path.join(downloadsDir, stableZipName))) {
      hasStable = true;
    }
  }
  if (!hasVersioned && !hasStable) {
    return {
      ok: false,
      id,
      label,
      title,
      warehouse,
      version,
      error:
        "Chưa đóng gói Chrome Ext — chạy npm run prebuild (hoặc npm run build).",
    };
  }
  return {
    ok: true,
    id,
    label,
    title,
    warehouse,
    version,
    filename: hasVersioned ? versionedName : stableZipName,
    download_url: hasVersioned
      ? `/downloads/${versionedName}`
      : `/downloads/${stableZipName}`,
    install: [
      `Giải nén ZIP (v${version || "?"}) vào một thư mục cố định`,
      "Mở chrome://extensions và bật Chế độ dành cho nhà phát triển",
      "Chọn Tải tiện ích đã giải nén rồi chọn thư mục vừa giải nén",
      "F5 trang Ops",
      ...installExtra,
    ],
  };
}

function respondChromeExtensionPackage(res, pack) {
  try {
    const payload = resolveChromeExtensionPackage(pack);
    if (!payload.ok) {
      res.status(404).json(payload);
      return;
    }
    res.json(payload);
  } catch (error) {
    console.error("[api/chrome-extension]", error);
    res.status(500).json({ ok: false, error: "Extension package unavailable" });
  }
}

/** Danh sách 3 Ext (TECS-TCS / TCS / SCSC) — nút tải chung trên Ops. */
app.get("/api/chrome-extensions", (_req, res) => {
  try {
    const extensions = CHROME_EXTENSION_PACKAGES.map((pack) =>
      resolveChromeExtensionPackage(pack),
    );
    const ready = extensions.filter((x) => x.ok).length;
    res.status(ready > 0 ? 200 : 404).json({
      ok: ready > 0,
      count: ready,
      total: extensions.length,
      extensions,
      tip:
        "Mỗi lần bump version trong manifest + deploy (prebuild đóng ZIP vào /downloads).",
    });
  } catch (error) {
    console.error("[api/chrome-extensions]", error);
    res.status(500).json({ ok: false, error: "Extension catalog unavailable" });
  }
});

app.get("/api/tcs-extension", (_req, res) => {
  respondChromeExtensionPackage(res, CHROME_EXTENSION_PACKAGES[0]);
});

/** Ext riêng kho TCS — tài khoản portal độc lập. */
app.get("/api/tcs-extension-direct", (_req, res) => {
  respondChromeExtensionPackage(res, CHROME_EXTENSION_PACKAGES[1]);
});

/** Ext riêng kho SCSC eCargo. */
app.get("/api/ecargo-extension", (_req, res) => {
  respondChromeExtensionPackage(res, CHROME_EXTENSION_PACKAGES[2]);
});

app.get("/api/state", appAuth.requireAuth, async (req, res) => {
  try {
    const full = await loadState();
    const scope = resolveRequestStateScope(req);
    res.json(projectAppState(full, scope));
  } catch (e) {
    console.error("[api/state]", e);
    res.status(500).json({
      error: isProduction ? "Failed to load state" : String(e?.message ?? e),
    });
  }
});

const mutationRateLimit = createMutationRateLimit();
const aiRateLimit = createRateLimit({
  max: Number(process.env.AI_RATE_LIMIT_MAX) > 0
    ? Number(process.env.AI_RATE_LIMIT_MAX)
    : 60,
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) > 0
    ? Number(process.env.AI_RATE_LIMIT_WINDOW_MS)
    : 60_000,
  error: "Quá nhiều yêu cầu AI. Vui lòng thử lại sau.",
  code: "AI_RATE_LIMITED",
});

app.post("/api/mutation", appAuth.requireAuth, mutationRateLimit, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const next = await runMutation(body);
    recordMutationEventSafe(body);
    await emitScopedSync(io, next);
    const scope = resolveRequestStateScope(req);
    res.json(projectAppState(next, scope));
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
 * Dùng cho thao tác hàng loạt (quét eSID) thay vì N round-trip.
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
    for (const m of list) recordMutationEventSafe(m);
    await emitScopedSync(io, next);
    const scope = resolveRequestStateScope(req);
    res.json(projectAppState(next, scope));
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

registerSheetsRoutes(app, { io });
registerEcargoVctRoutes(app, { runMutation, loadState, io });
app.use("/api/ai", appAuth.requireAuth);
app.use("/api/ai", aiRateLimit);
registerAiRoutes(app, { loadState });
console.info("[api] ai (Gemini improvement report)");

if (isDatabaseConfigured()) {
  registerLookupRoutes(app);
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
    const initial = await loadState();
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
