/**
 * Spawn sidecar TCS AWB agent (Playwright) trên :8765.
 * Dùng chung bởi `tcs-agent.mjs` và `dev.mjs` (auto-start).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const agentDir = path.join(root, "tcs-awb-automation");
export const AGENT_PORT = Number(process.env.TCS_AGENT_PORT || 8765);

export function resolveAgentPython() {
  const win = process.platform === "win32";
  const candidates = [
    process.env.TCS_PYTHON,
    win ? path.join(agentDir, ".venv", "Scripts", "python.exe") : path.join(agentDir, ".venv", "bin", "python"),
    win ? path.join(agentDir, ".venv", "Scripts", "python") : null,
    "python",
    "python3",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "python" || c === "python3") return c;
    if (fs.existsSync(c)) return c;
  }
  return win ? "python" : "python3";
}

function canConnectTcp(host, port, timeoutMs = 800) {
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

export async function isAgentListening(port = AGENT_PORT) {
  return canConnectTcp("127.0.0.1", port);
}

/**
 * @param {{ real?: boolean, stdio?: "inherit"|"pipe"|"ignore", env?: Record<string,string> }} opts
 * @returns {import("node:child_process").ChildProcess}
 */
export function spawnTcsAgent(opts = {}) {
  const real = opts.real !== false;
  const py = resolveAgentPython();
  const args = ["-m", "app.main", "agent", real ? "--real" : "--mock", ...(real ? [] : ["--dry-run"])];
  // Máy kho / npm run dev: mặc định HEADED (Chrome thật) để xem form trước HOÀN TẤT.
  // Railway/Docker: start-fullstack đặt TCS_HEADLESS=1.
  const headless =
    opts.env?.TCS_HEADLESS ??
    process.env.TCS_HEADLESS ??
    "0";
  const env = {
    ...process.env,
    ...(opts.env || {}),
    TCS_MOCK: real ? "0" : "1",
    TCS_DRY_RUN: real ? process.env.TCS_DRY_RUN || "0" : "1",
    TCS_HEADLESS: String(headless),
    TCS_AGENT_HOST: process.env.TCS_AGENT_HOST || "127.0.0.1",
    TCS_AGENT_PORT: String(AGENT_PORT),
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
  };
  const modeLabel = String(env.TCS_HEADLESS) === "1" || String(env.TCS_HEADLESS).toLowerCase() === "true"
    ? "HEADLESS"
    : "HEADED";
  console.info(`[tcs-agent] ${modeLabel} · ${py} ${args.join(" ")} (cwd=${agentDir})`);
  return spawn(py, args, {
    cwd: agentDir,
    env,
    stdio: opts.stdio ?? "inherit",
    shell: false,
  });
}

export async function waitForAgentHealth(maxMs = 45_000, port = AGENT_PORT) {
  const deadline = Date.now() + maxMs;
  const url = `http://127.0.0.1:${port}/health`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.ok || body?.service === "tcs-awb-agent") return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
