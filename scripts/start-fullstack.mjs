/**
 * Railway/Docker: agent Playwright + Node server (+ optional noVNC desktop).
 *
 * TCS_VNC=1 (mặc định trên Docker): Xvfb + x11vnc + noVNC → Ops `/tcs-desktop`
 * thao tác Chrome agent thật. Agent chạy headed trên DISPLAY=:99.
 *
 * TCS_VNC=0: agent headless như cũ (nhẹ hơn, chỉ ảnh live).
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isTcsVncEnabled, startTcsDesktop } from "./start-tcs-desktop.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = path.join(root, "tcs-awb-automation");

// Safety gate (giống start:railway) — chặn deploy có pattern phá DB.
const check = spawnSync(process.execPath, ["scripts/check-deploy-safe.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if ((check.status ?? 1) !== 0) process.exit(check.status ?? 1);

const pythonBin =
  process.env.TCS_PYTHON || (process.platform === "win32" ? "python" : "python3");

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      // ignore
    }
  }
  process.exit(code);
}

function run(name, cmd, args, opts = {}) {
  console.info(`[start] ▶ ${name}: ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    stdio: "inherit",
    ...opts,
    env: { ...process.env, ...(opts.env || {}) },
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    console.error(`[start] ✖ ${name} thoát (code=${code} signal=${signal})`);
    // Trong container: 1 tiến trình chết → cả service restart (Railway ON_FAILURE).
    shutdown(code ?? 1);
  });
  child.on("error", (err) => {
    console.error(`[start] ✖ ${name} lỗi spawn: ${err?.message || err}`);
    shutdown(1);
  });
  return child;
}

async function main() {
  const vnc = isTcsVncEnabled();
  const display = (process.env.DISPLAY || ":99").trim() || ":99";
  let desktopOk = false;

  if (vnc) {
    try {
      const r = await startTcsDesktop(children, { onFatal: (code) => shutdown(code ?? 1) });
      desktopOk = Boolean(r?.ok);
    } catch (e) {
      console.error(`[start] ✖ tcs-desktop: ${e?.message || e}`);
      console.error("[start] Fallback headless — Ops vẫn chạy, không có cửa sổ noVNC.");
      desktopOk = false;
    }
  } else {
    console.info("[start] TCS_VNC=0 — bỏ qua noVNC desktop, agent headless");
  }

  const envHeadless = process.env.TCS_HEADLESS;
  const headless =
    envHeadless != null && String(envHeadless).trim() !== ""
      ? String(envHeadless)
      : desktopOk
        ? "0"
        : "1";

  const agentEnv = {
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    TCS_MOCK: "0",
    TCS_HEADLESS: headless,
    TCS_AUTO_OPEN: process.env.TCS_AUTO_OPEN || "1",
    TCS_AGENT_HOST: process.env.TCS_AGENT_HOST || "127.0.0.1",
    TCS_AGENT_PORT: process.env.TCS_AGENT_PORT || "8765",
  };
  const headed =
    headless === "0" || headless.toLowerCase() === "false" || headless.toLowerCase() === "off";
  if (headed) {
    agentEnv.DISPLAY = display;
  }

  console.info(
    `[start] agent ${headed ? `HEADED DISPLAY=${display}` : "HEADLESS"} · VNC desktop=${desktopOk}`
  );

  run("tcs-agent", pythonBin, ["-m", "app.main", "agent", "--real"], {
    cwd: agentDir,
    env: agentEnv,
  });

  run("web", process.execPath, ["server/index.mjs"], { cwd: root });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => shutdown(0));
}

main().catch((e) => {
  console.error("[start] fatal:", e);
  shutdown(1);
});
