/**
 * Dev ổn định: giải phóng port, khởi động API trước, chờ sẵn sàng rồi mới chạy Vite.
 * Tránh lỗi proxy ECONNREFUSED khi Vite start trước server.
 */
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.PORT || 3001);
const VITE_PORT = Number(process.env.VITE_PORT || 5173);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort(port) {
  if (process.platform === "win32") {
    try {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
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
  const url = `http://127.0.0.1:${API_PORT}/api/auth/gate`;
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
  return spawn(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  });
}

console.info(`[dev] Giải phóng port ${API_PORT}, ${VITE_PORT}…`);
freePort(API_PORT);
freePort(VITE_PORT);
await sleep(800);

console.info(`[dev] Khởi động API :${API_PORT}…`);
const server = run("node", ["server/index.mjs"]);

const ready = await waitForApi();
if (!ready) {
  console.error(`[dev] API không sẵn sàng sau 60s — kiểm tra Redis / .env.local`);
  server.kill("SIGTERM");
  process.exit(1);
}

console.info(`[dev] API OK — khởi động Vite :${VITE_PORT}…`);
const vite = run("npx", ["vite", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"], {
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
