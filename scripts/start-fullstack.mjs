/**
 * Railway/Docker: Ops + agent Playwright (API-first).
 *
 * Mặc định: HTTP agent :8765, KHÔNG mở Chromium lúc boot (TCS_AUTO_OPEN=0).
 * Chrome chỉ mở khi user bấm Đăng Nhập TCS / Quét hoặc POST /session/open.
 *
 * Dual :8766 chỉ khi TCS_AGENT_DUAL explicit 1/true/on — không suy từ user/pass.
 * TCS_AGENT_ENABLED=0: không spawn Python; web vẫn chạy; /tcs-agent → AGENT_OFF.
 *
 * Agent chết không kéo sập web. Web chết mới shutdown agent.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  agentProcessEnabled,
  dualAgentEnabled,
  resolveAutoOpen,
} from "./start-fullstack-flags.mjs";

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
  const { essential = false, env: extraEnv, ...spawnOpts } = opts;
  console.info(`[start] ▶ ${name}: ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    stdio: "inherit",
    ...spawnOpts,
    env: { ...process.env, ...(extraEnv || {}) },
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    console.error(`[start] ✖ ${name} thoát (code=${code} signal=${signal})`);
    if (essential) {
      shutdown(code ?? 1);
      return;
    }
    console.error(`[start] ${name} đã dừng — web vẫn chạy`);
  });
  child.on("error", (err) => {
    console.error(`[start] ✖ ${name} lỗi spawn: ${err?.message || err}`);
    if (essential) shutdown(1);
  });
  return child;
}

function baseAgentEnv(headless) {
  const env = {
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    TCS_MOCK: "0",
    TCS_HEADLESS: headless,
    TCS_AUTO_OPEN: resolveAutoOpen(process.env),
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
  const autoOpen = resolveAutoOpen(process.env);
  const dual = dualAgentEnabled(process.env);
  const agentOn = agentProcessEnabled(process.env);

  console.info(
    `[start] ${headed ? "HEADED" : "HEADLESS"} · auto_open=${autoOpen} · dual=${dual} · agent_enabled=${agentOn}`
  );

  const hubUser = String(process.env.TCS_USERNAME || "").trim();
  const hubPass = String(process.env.TCS_PASSWORD || "");
  const tcsUser = String(process.env.TCS_USERNAME_TCS || "").trim();
  const tcsPass = String(process.env.TCS_PASSWORD_TCS || "");
  const mask = (u) => (u ? `${u.slice(0, 2)}***${u.slice(-2)}` : "(empty)");

  if (!agentOn) {
    console.info(
      "[start] TCS_AGENT_ENABLED=0 — không spawn Python. Web vẫn chạy. /tcs-agent → AGENT_OFF"
    );
  } else {
    console.info(`[start] agent TECS-TCS :8765 user=${mask(hubUser)} (HTTP, Chrome on-demand)`);
    run("tcs-agent-hub", pythonBin, ["-m", "app.main", "agent", "--real"], {
      cwd: agentDir,
      essential: false,
      env: {
        ...baseAgentEnv(headless),
        TCS_AGENT_PORT: process.env.TCS_AGENT_PORT || "8765",
        TCS_WAREHOUSE_SCOPE: "TECS-TCS",
        TCS_BROWSER_PROFILE:
          process.env.TCS_BROWSER_PROFILE || "./browser_profile_hub",
        TCS_USERNAME: hubUser,
        TCS_PASSWORD: hubPass,
        TCS_USERNAME_TCS: "",
        TCS_PASSWORD_TCS: "",
      },
    });

    if (dual) {
      if (!tcsUser || !tcsPass) {
        console.error(
          "[start] TCS_AGENT_DUAL bật nhưng thiếu TCS_USERNAME_TCS / TCS_PASSWORD_TCS — bỏ :8766, không Đăng Nhập TCS nhầm user hub."
        );
      } else {
        if (hubUser && tcsUser && hubUser.toLowerCase() === tcsUser.toLowerCase()) {
          console.warn(
            "[start] CẢNH BÁO: TCS_USERNAME và TCS_USERNAME_TCS trùng nhau — hai kho sẽ dùng cùng tài khoản portal."
          );
        }
        console.info(`[start] agent TCS :8766 user=${mask(tcsUser)}`);
        run("tcs-agent-tcs", pythonBin, ["-m", "app.main", "agent", "--real"], {
          cwd: agentDir,
          essential: false,
          env: {
            ...baseAgentEnv(headless),
            TCS_AGENT_PORT: process.env.TCS_AGENT_PORT_TCS || "8766",
            TCS_WAREHOUSE_SCOPE: "TCS",
            TCS_BROWSER_PROFILE:
              process.env.TCS_BROWSER_PROFILE_TCS || "./browser_profile_tcs",
            TCS_USERNAME: tcsUser,
            TCS_PASSWORD: tcsPass,
            TCS_USERNAME_TCS: tcsUser,
            TCS_PASSWORD_TCS: tcsPass,
          },
        });
      }
    } else {
      console.info(
        "[start] agent kho TCS :8766 tắt — chỉ bật khi TCS_AGENT_DUAL=1"
      );
    }
  }

  run("web", process.execPath, ["server/index.mjs"], { cwd: root, essential: true });
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
