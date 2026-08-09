/**
 * Railway/Docker: Ops + agent Playwright (API-first, headless mặc định).
 *
 * Dual agent (parity TECS-TCS / TCS):
 *   :8765  hub — TCS_USERNAME / TCS_PASSWORD, TCS_BROWSER_PROFILE
 *   :8766  TCS — bật khi TCS_AGENT_DUAL=1 hoặc có TCS_USERNAME_TCS
 *                TCS_USERNAME_TCS / TCS_PASSWORD_TCS, TCS_BROWSER_PROFILE_TCS
 *
 * Phone trên Railway gọi /tcs-agent + header X-Portal-Warehouse (không cần PC kho).
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = path.join(root, "tcs-awb-automation");

const check = spawnSync(process.execPath, ["scripts/check-deploy-safe.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if ((check.status ?? 1) !== 0) process.exit(check.status ?? 1);

const pythonBin =
  process.env.TCS_PYTHON || (process.platform === "win32" ? "python" : "python3");

const children = [];
let shuttingDown = false;

function flagOn(raw, defaultOn = false) {
  if (raw == null || String(raw).trim() === "") return defaultOn;
  const t = String(raw).trim().toLowerCase();
  return t !== "0" && t !== "false" && t !== "off" && t !== "no";
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
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
    shutdown(code ?? 1);
  });
  child.on("error", (err) => {
    console.error(`[start] ✖ ${name} lỗi spawn: ${err?.message || err}`);
    shutdown(1);
  });
  return child;
}

function baseAgentEnv(headless) {
  const env = {
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    TCS_MOCK: "0",
    TCS_HEADLESS: headless,
    TCS_AUTO_OPEN: process.env.TCS_AUTO_OPEN || "1",
    TCS_CAPTCHA_OCR: process.env.TCS_CAPTCHA_OCR || "1",
    TCS_PREFER_SESSION: process.env.TCS_PREFER_SESSION || "1",
    TCS_AGENT_HOST: process.env.TCS_AGENT_HOST || "127.0.0.1",
  };
  const headed =
    headless === "0" ||
    headless.toLowerCase() === "false" ||
    headless.toLowerCase() === "off";
  if (headed && process.env.DISPLAY) {
    env.DISPLAY = process.env.DISPLAY;
  }
  return env;
}

function dualAgentEnabled() {
  if (flagOn(process.env.TCS_AGENT_DUAL, false)) return true;
  return Boolean(
    String(process.env.TCS_USERNAME_TCS || "").trim() &&
      String(process.env.TCS_PASSWORD_TCS || "").trim()
  );
}

function main() {
  const envHeadless = process.env.TCS_HEADLESS;
  const headless =
    envHeadless != null && String(envHeadless).trim() !== ""
      ? String(envHeadless).trim()
      : "1";

  const headed =
    headless === "0" ||
    headless.toLowerCase() === "false" ||
    headless.toLowerCase() === "off";
  console.info(
    `[start] agent ${headed ? "HEADED" : "HEADLESS"} · API-first · dual=${dualAgentEnabled()}`
  );

  const hubUser = String(process.env.TCS_USERNAME || "").trim();
  const hubPass = String(process.env.TCS_PASSWORD || "");
  const tcsUser = String(process.env.TCS_USERNAME_TCS || "").trim();
  const tcsPass = String(process.env.TCS_PASSWORD_TCS || "");
  const mask = (u) => (u ? `${u.slice(0, 2)}***${u.slice(-2)}` : "(empty)");

  // Hub TECS-TCS :8765 — tuyệt đối không dùng credential kho TCS
  console.info(`[start] agent TECS-TCS :8765 user=${mask(hubUser)}`);
  run("tcs-agent-hub", pythonBin, ["-m", "app.main", "agent", "--real"], {
    cwd: agentDir,
    env: {
      ...baseAgentEnv(headless),
      TCS_AGENT_PORT: process.env.TCS_AGENT_PORT || "8765",
      TCS_WAREHOUSE_SCOPE: "TECS-TCS",
      TCS_BROWSER_PROFILE:
        process.env.TCS_BROWSER_PROFILE || "./browser_profile_hub",
      TCS_USERNAME: hubUser,
      TCS_PASSWORD: hubPass,
      // Chặn agent đọc nhầm biến kho TCS từ process.env cha
      TCS_USERNAME_TCS: "",
      TCS_PASSWORD_TCS: "",
    },
  });

  if (dualAgentEnabled()) {
    if (!tcsUser || !tcsPass) {
      console.error(
        "[start] TCS_AGENT_DUAL bật nhưng thiếu TCS_USERNAME_TCS / TCS_PASSWORD_TCS — không fallback sang user hub (tránh ĐN nhầm)."
      );
      shutdown(1);
      return;
    }
    if (hubUser && tcsUser && hubUser.toLowerCase() === tcsUser.toLowerCase()) {
      console.warn(
        "[start] CẢNH BÁO: TCS_USERNAME và TCS_USERNAME_TCS trùng nhau — hai kho sẽ dùng cùng tài khoản portal."
      );
    }
    console.info(`[start] agent TCS :8766 user=${mask(tcsUser)}`);
    run("tcs-agent-tcs", pythonBin, ["-m", "app.main", "agent", "--real"], {
      cwd: agentDir,
      env: {
        ...baseAgentEnv(headless),
        TCS_AGENT_PORT: process.env.TCS_AGENT_PORT_TCS || "8766",
        TCS_WAREHOUSE_SCOPE: "TCS",
        TCS_BROWSER_PROFILE:
          process.env.TCS_BROWSER_PROFILE_TCS || "./browser_profile_tcs",
        // Chỉ dùng credential kho TCS — không fallback hub
        TCS_USERNAME: tcsUser,
        TCS_PASSWORD: tcsPass,
        TCS_USERNAME_TCS: tcsUser,
        TCS_PASSWORD_TCS: tcsPass,
      },
    });
  } else {
    console.info(
      "[start] agent kho TCS :8766 tắt — set TCS_AGENT_DUAL=1 hoặc TCS_USERNAME_TCS + TCS_PASSWORD_TCS"
    );
  }

  run("web", process.execPath, ["server/index.mjs"], { cwd: root });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => shutdown(0));
}

try {
  main();
} catch (e) {
  console.error("[start] fatal:", e);
  shutdown(1);
}
