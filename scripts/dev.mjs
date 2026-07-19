/**
 * Dev ổn định: giải phóng port, khởi động API trước, chờ sẵn sàng rồi mới chạy Vite.
 * Tránh lỗi proxy ECONNREFUSED khi Vite start trước server.
 *
 * Cần DATABASE_URL trong .env.local (Postgres). Local: `docker compose up -d`
 */
import { spawn } from "node:child_process";
import { execFileSync, execSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_PORT,
  isAgentListening,
  spawnTcsAgent,
  waitForAgentHealth,
} from "./spawnTcsAgent.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.PORT || 3001);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);
/** Tự chạy agent Playwright cùng `npm run dev` (mặc định bật). Tắt: TCS_AGENT_AUTO=0 */
const AUTO_AGENT = !["0", "false", "off"].includes(
  String(process.env.TCS_AGENT_AUTO ?? "1").trim().toLowerCase()
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readEnvFileValue(rel, key) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return "";
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    if (t.slice(0, eq).trim() !== key) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val.trim();
  }
  return "";
}

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL?.trim() ||
    readEnvFileValue(".env.local", "DATABASE_URL") ||
    readEnvFileValue(".env", "DATABASE_URL") ||
    ""
  );
}

function parsePgHostPort(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? Number(u.port) : 5432,
    };
  } catch {
    return null;
  }
}

function canConnectTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function ensureLocalPostgres() {
  const databaseUrl = resolveDatabaseUrl();
  const target = parsePgHostPort(databaseUrl);
  if (!target) return;

  const isLocal =
    target.host === "127.0.0.1" ||
    target.host === "localhost" ||
    target.host === "::1";
  if (!isLocal) return;

  if (await canConnectTcp(target.host, target.port)) return;

  console.warn(
    `[dev] Postgres ${target.host}:${target.port} chưa lắng nghe — thử docker compose up -d…`
  );
  try {
    execFileSync("docker", ["compose", "up", "-d"], { cwd: root, stdio: "inherit" });
  } catch {
    console.error(
      `[dev] Không khởi động được Postgres.\n` +
        `      Chạy thủ công: docker compose up -d\n` +
        `      Rồi: npm run dev`
    );
    process.exit(1);
  }

  for (let i = 0; i < 30; i++) {
    if (await canConnectTcp(target.host, target.port)) {
      console.info("[dev] Postgres local sẵn sàng.");
      return;
    }
    await sleep(1000);
  }

  console.error(
    `[dev] Postgres vẫn chưa sẵn sàng sau 30s — kiểm tra Docker Desktop / container tecsops-postgres`
  );
  process.exit(1);
}

function ensureDatabaseUrlHint() {
  if (resolveDatabaseUrl()) return;
  console.error(`
[dev] Thiếu DATABASE_URL.

  1) Khởi động Postgres local:
       docker compose up -d

  2) Thêm vào .env.local:
       DATABASE_URL=postgresql://tecsops:tecsops@127.0.0.1:5434/tecsops

`);
  process.exit(1);
}

function freePort(port) {
  if (process.platform === "win32") {
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore" }
      );
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null`, {
      shell: true,
      stdio: "ignore",
    });
  } catch {
    /* ignore */
  }
}

async function waitForApi(maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  const url = `http://127.0.0.1:${API_PORT}/api/health`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  return false;
}

function run(cmd, args, extraEnv = {}) {
  // Windows: shell chỉ khi cần resolve .cmd (npx); tránh DEP0190 với node.
  const useShell = process.platform === "win32" && cmd !== "node";
  return spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: useShell,
  });
}

ensureDatabaseUrlHint();
await ensureLocalPostgres();

console.info(`[dev] Giải phóng port ${API_PORT}, ${VITE_PORT}${AUTO_AGENT ? `, ${AGENT_PORT}` : ""}…`);
freePort(API_PORT);
freePort(VITE_PORT);
if (AUTO_AGENT) freePort(AGENT_PORT);
await sleep(800);

console.info(`[dev] Khởi động API :${API_PORT}…`);
const server = run("node", ["server/index.mjs"], {
  TECSOPS_DEV: "1",
});

const ready = await waitForApi();
if (!ready) {
  console.error(
    `[dev] API không sẵn sàng sau 60s — kiểm tra log server / DATABASE_URL trong .env.local\n` +
      `      Postgres local: docker compose up -d  (port 5434)`
  );
  server.kill("SIGTERM");
  process.exit(1);
}

/** @type {import("node:child_process").ChildProcess | null} */
let agent = null;
let shuttingDown = false;
let agentRestarts = 0;

async function ensureTcsAgent() {
  if (!AUTO_AGENT) {
    console.info("[dev] TCS_AGENT_AUTO=0 — không tự chạy agent. Cần: npm run tcs:agent:real");
    return;
  }
  if (await isAgentListening()) {
    console.info(`[dev] Agent TCS đã listen :${AGENT_PORT} — giữ nguyên.`);
    return;
  }
  console.info(`[dev] Khởi động agent TCS (REAL) :${AGENT_PORT}…`);
  agent = spawnTcsAgent({ real: true, stdio: "inherit" });
  agent.on("error", (err) => {
    console.error(`[dev] Agent spawn lỗi: ${err?.message || err}`);
    console.error(
      "  Cài Python deps: cd tcs-awb-automation && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt && python -m playwright install chromium"
    );
  });
  agent.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.warn(`[dev] Agent thoát (code=${code} signal=${signal})`);
    if (agentRestarts < 2) {
      agentRestarts += 1;
      console.warn(`[dev] Thử start lại agent (${agentRestarts}/2) sau 2s…`);
      setTimeout(() => {
        void ensureTcsAgent();
      }, 2000);
    } else {
      console.error(
        `[dev] Agent không giữ được — Ops sẽ hiện Offline. Chạy tay: npm run tcs:agent:real`
      );
    }
  });
  const ok = await waitForAgentHealth(45_000);
  if (ok) {
    console.info(`[dev] Agent TCS OK — proxy /tcs-agent → http://127.0.0.1:${AGENT_PORT}`);
  } else {
    console.error(
      `[dev] Agent chưa sẵn sàng sau 45s — kiểm tra Python/venv/playwright.\n` +
        `      Thử: npm run tcs:agent:real`
    );
  }
}

await ensureTcsAgent();

console.info(`[dev] API OK — khởi động Vite :${VITE_PORT} (LAN 0.0.0.0)…`);
// 0.0.0.0: máy khác mở http://IP-máy-kho:5173 → proxy /tcs-agent → agent local
const vite = run("npx", ["vite", "--host", "0.0.0.0", "--port", String(VITE_PORT), "--strictPort"], {
  VITE_PROXY_PORT: String(API_PORT),
});

function shutdown() {
  shuttingDown = true;
  try {
    agent?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  vite.kill("SIGTERM");
  server.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code) => {
  if (code && code !== 0) {
    shuttingDown = true;
    try {
      agent?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    vite.kill("SIGTERM");
    process.exit(code);
  }
});

vite.on("exit", (code) => {
  shuttingDown = true;
  try {
    agent?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  server.kill("SIGTERM");
  if (code && code !== 0) process.exit(code);
});
