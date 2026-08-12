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
const AGENT_PORT_TCS = Number(process.env.TCS_AGENT_PORT_TCS || 8766);
/** Tự chạy agent Playwright cùng `npm run dev` (mặc định bật). Tắt: TCS_AGENT_AUTO=0 */
const AUTO_AGENT = !["0", "false", "off"].includes(
  String(process.env.TCS_AGENT_AUTO ?? "1").trim().toLowerCase()
);

function envFlagOn(raw, defaultOn = false) {
  if (raw == null || String(raw).trim() === "") return defaultOn;
  const t = String(raw).trim().toLowerCase();
  return t !== "0" && t !== "false" && t !== "off";
}

/** Dual TECS-TCS(:8765) + TCS(:8766) — từ .env.local hoặc cặp credential TCS. */
function dualAgentEnabled() {
  if (envFlagOn(process.env.TCS_AGENT_DUAL, false)) return true;
  if (envFlagOn(readEnvFileValue(".env.local", "TCS_AGENT_DUAL"), false)) {
    return true;
  }
  const u =
    process.env.TCS_USERNAME_TCS?.trim() ||
    readEnvFileValue(".env.local", "TCS_USERNAME_TCS") ||
    readEnvFileValue("tcs-awb-automation/.env.tcs", "TCS_USERNAME");
  const p =
    process.env.TCS_PASSWORD_TCS ||
    readEnvFileValue(".env.local", "TCS_PASSWORD_TCS") ||
    readEnvFileValue("tcs-awb-automation/.env.tcs", "TCS_PASSWORD");
  return Boolean(String(u || "").trim() && String(p || "").trim());
}

function resolveDualCredentials() {
  const hubUser =
    process.env.TCS_USERNAME?.trim() ||
    readEnvFileValue(".env.local", "TCS_USERNAME") ||
    readEnvFileValue("tcs-awb-automation/.env.hub", "TCS_USERNAME") ||
    readEnvFileValue("tcs-awb-automation/.env", "TCS_USERNAME");
  const hubPass =
    process.env.TCS_PASSWORD ||
    readEnvFileValue(".env.local", "TCS_PASSWORD") ||
    readEnvFileValue("tcs-awb-automation/.env.hub", "TCS_PASSWORD") ||
    readEnvFileValue("tcs-awb-automation/.env", "TCS_PASSWORD");
  const tcsUser =
    process.env.TCS_USERNAME_TCS?.trim() ||
    readEnvFileValue(".env.local", "TCS_USERNAME_TCS") ||
    readEnvFileValue("tcs-awb-automation/.env.tcs", "TCS_USERNAME");
  const tcsPass =
    process.env.TCS_PASSWORD_TCS ||
    readEnvFileValue(".env.local", "TCS_PASSWORD_TCS") ||
    readEnvFileValue("tcs-awb-automation/.env.tcs", "TCS_PASSWORD");
  return { hubUser, hubPass, tcsUser, tcsPass };
}

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

const DUAL_AGENT = dualAgentEnabled();
console.info(
  `[dev] Giải phóng port ${API_PORT}, ${VITE_PORT}` +
    `${AUTO_AGENT ? `, ${AGENT_PORT}` : ""}` +
    `${AUTO_AGENT && DUAL_AGENT ? `, ${AGENT_PORT_TCS}` : ""}…`
);
freePort(API_PORT);
freePort(VITE_PORT);
if (AUTO_AGENT) freePort(AGENT_PORT);
if (AUTO_AGENT && DUAL_AGENT) freePort(AGENT_PORT_TCS);
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
/** @type {import("node:child_process").ChildProcess | null} */
let agentTcs = null;
let shuttingDown = false;
let agentRestarts = 0;
let agentTcsRestarts = 0;

function wireAgentExit(child, label, onRetry) {
  child.on("error", (err) => {
    console.error(`[dev] Agent ${label} spawn lỗi: ${err?.message || err}`);
    console.error(
      "  Cài Python deps: cd tcs-awb-automation && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt && python -m playwright install chromium"
    );
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.warn(`[dev] Agent ${label} thoát (code=${code} signal=${signal})`);
    onRetry();
  });
}

async function ensureTcsAgent() {
  if (!AUTO_AGENT) {
    console.info("[dev] TCS_AGENT_AUTO=0 — không tự chạy agent. Cần: npm run tcs:agent:real");
    return;
  }
  const creds = resolveDualCredentials();
  const hubEnv = {
    TCS_AGENT_PORT: String(AGENT_PORT),
    TCS_WAREHOUSE_SCOPE: "TECS-TCS",
    TCS_BROWSER_PROFILE:
      process.env.TCS_BROWSER_PROFILE ||
      readEnvFileValue(".env.local", "TCS_BROWSER_PROFILE") ||
      "./browser_profile_hub",
    TCS_USERNAME: creds.hubUser || "",
    TCS_PASSWORD: creds.hubPass || "",
    // Chặn agent hub đọc nhầm credential kho TCS
    TCS_USERNAME_TCS: "",
    TCS_PASSWORD_TCS: "",
  };

  if (await isAgentListening(AGENT_PORT)) {
    console.info(`[dev] Agent TECS-TCS đã listen :${AGENT_PORT} — giữ nguyên.`);
  } else {
    console.info(
      `[dev] Khởi động agent TECS-TCS (REAL) :${AGENT_PORT} user=${creds.hubUser || "(empty)"}…`
    );
    agent = spawnTcsAgent({ real: true, stdio: "inherit", env: hubEnv });
    wireAgentExit(agent, "TECS-TCS", () => {
      if (agentRestarts < 2) {
        agentRestarts += 1;
        console.warn(`[dev] Thử start lại hub (${agentRestarts}/2) sau 2s…`);
        setTimeout(() => {
          void ensureTcsAgent();
        }, 2000);
      } else {
        console.error(
          `[dev] Agent hub không giữ được — Ops TECS-TCS Offline. Chạy: npm run portal:start:hub`
        );
      }
    });
    const ok = await waitForAgentHealth(45_000, AGENT_PORT);
    if (ok) {
      console.info(
        `[dev] Agent TECS-TCS OK — proxy /tcs-agent → http://127.0.0.1:${AGENT_PORT}`
      );
    } else {
      console.error(
        `[dev] Agent hub chưa sẵn sàng sau 45s — thử: npm run tcs:agent:real`
      );
    }
  }

  if (!DUAL_AGENT) {
    console.info(
      "[dev] agent kho TCS :8766 tắt — set TCS_AGENT_DUAL=1 hoặc TCS_USERNAME_TCS + TCS_PASSWORD_TCS trong .env.local"
    );
    return;
  }
  if (!creds.tcsUser || !creds.tcsPass) {
    console.error(
      "[dev] TCS_AGENT_DUAL bật nhưng thiếu TCS_USERNAME_TCS / TCS_PASSWORD_TCS — không fallback sang user hub."
    );
    return;
  }
  if (
    creds.hubUser &&
    creds.tcsUser &&
    creds.hubUser.toLowerCase() === creds.tcsUser.toLowerCase()
  ) {
    console.warn(
      "[dev] CẢNH BÁO: TCS_USERNAME và TCS_USERNAME_TCS trùng — hai kho dùng cùng tài khoản portal."
    );
  }

  if (await isAgentListening(AGENT_PORT_TCS)) {
    console.info(`[dev] Agent kho TCS đã listen :${AGENT_PORT_TCS} — giữ nguyên.`);
    return;
  }

  const tcsEnv = {
    TCS_AGENT_PORT: String(AGENT_PORT_TCS),
    TCS_WAREHOUSE_SCOPE: "TCS",
    TCS_BROWSER_PROFILE:
      process.env.TCS_BROWSER_PROFILE_TCS ||
      readEnvFileValue(".env.local", "TCS_BROWSER_PROFILE_TCS") ||
      "./browser_profile_tcs",
    TCS_USERNAME: creds.tcsUser,
    TCS_PASSWORD: creds.tcsPass,
    TCS_USERNAME_TCS: creds.tcsUser,
    TCS_PASSWORD_TCS: creds.tcsPass,
  };
  console.info(
    `[dev] Khởi động agent kho TCS (REAL) :${AGENT_PORT_TCS} user=${creds.tcsUser}…`
  );
  agentTcs = spawnTcsAgent({ real: true, stdio: "inherit", env: tcsEnv });
  wireAgentExit(agentTcs, "TCS", () => {
    if (agentTcsRestarts < 2) {
      agentTcsRestarts += 1;
      console.warn(`[dev] Thử start lại kho TCS (${agentTcsRestarts}/2) sau 2s…`);
      setTimeout(() => {
        void ensureTcsAgent();
      }, 2000);
    } else {
      console.error(
        `[dev] Agent kho TCS không giữ được — Ops TCS Offline. Chạy: npm run portal:start:tcs`
      );
    }
  });
  const okTcs = await waitForAgentHealth(45_000, AGENT_PORT_TCS);
  if (okTcs) {
    console.info(
      `[dev] Agent kho TCS OK — proxy X-Portal-Warehouse:TCS → :${AGENT_PORT_TCS}`
    );
  } else {
    console.error(
      `[dev] Agent kho TCS chưa sẵn sàng sau 45s — thử: npm run portal:start:tcs`
    );
  }
}

await ensureTcsAgent();

console.info(`[dev] API OK — khởi động Vite :${VITE_PORT} (LAN 0.0.0.0)…`);
// 0.0.0.0: máy khác mở http://IP-máy-kho:5173 → proxy /tcs-agent → agent local
const vite = run("npx", ["vite", "--host", "0.0.0.0", "--port", String(VITE_PORT), "--strictPort"], {
  VITE_PROXY_PORT: String(API_PORT),
});

function killAgents() {
  for (const child of [agent, agentTcs]) {
    try {
      child?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

function shutdown() {
  shuttingDown = true;
  killAgents();
  vite.kill("SIGTERM");
  server.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code) => {
  if (code && code !== 0) {
    shuttingDown = true;
    killAgents();
    vite.kill("SIGTERM");
    process.exit(code);
  }
});

vite.on("exit", (code) => {
  shuttingDown = true;
  killAgents();
  server.kill("SIGTERM");
  if (code && code !== 0) process.exit(code);
});
