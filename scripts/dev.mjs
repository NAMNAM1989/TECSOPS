/**
 * Dev ổn định: giải phóng port, khởi động API trước, chờ sẵn sàng rồi mới chạy Vite.
 * Tránh lỗi proxy ECONNREFUSED khi Vite start trước server.
 *
 * Cần DATABASE_URL trong .env.local (Postgres). Local: `docker compose up -d`
 */
import { spawn } from "node:child_process";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.PORT || 3001);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

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

function ensureDatabaseUrlHint() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const fromLocal = readEnvFileValue(".env.local", "DATABASE_URL");
  const fromDot = readEnvFileValue(".env", "DATABASE_URL");
  if (fromEnv || fromLocal || fromDot) return;
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

console.info(`[dev] Giải phóng port ${API_PORT}, ${VITE_PORT}…`);
freePort(API_PORT);
freePort(VITE_PORT);
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

console.info(`[dev] API OK — khởi động Vite :${VITE_PORT} (LAN 0.0.0.0)…`);
// 0.0.0.0: máy khác mở http://IP-máy-kho:5173 → proxy /tcs-agent → agent local
const vite = run("npx", ["vite", "--host", "0.0.0.0", "--port", String(VITE_PORT), "--strictPort"], {
  VITE_PROXY_PORT: String(API_PORT),
});

function shutdown() {
  vite.kill("SIGTERM");
  server.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code) => {
  if (code && code !== 0) {
    vite.kill("SIGTERM");
    process.exit(code);
  }
});

vite.on("exit", (code) => {
  server.kill("SIGTERM");
  if (code && code !== 0) process.exit(code);
});
