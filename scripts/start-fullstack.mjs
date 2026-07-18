/**
 * Railway/Docker: chạy CẢ agent Playwright (Python, headless) + Node server trong
 * cùng 1 container. Proxy /tcs-agent của Express trỏ tới agent 127.0.0.1:8765 nội bộ,
 * nên Ops mở từ máy bất kỳ đều gọi được PDF ESID qua Railway.
 *
 * LƯU Ý: Chrome trên cloud login TCS bấp bênh (CAPTCHA/OCR, IP nước ngoài, session
 * mất khi redeploy nếu không mount volume cho TCS_BROWSER_PROFILE). Xem docs.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

// 1) Agent Playwright (Python, REAL). Headless + auto-open lấy từ env TCS_HEADLESS/TCS_AUTO_OPEN.
run("tcs-agent", pythonBin, ["-m", "app.main", "agent", "--real"], {
  cwd: agentDir,
  env: {
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    TCS_MOCK: "0",
    TCS_AGENT_HOST: process.env.TCS_AGENT_HOST || "127.0.0.1",
    TCS_AGENT_PORT: process.env.TCS_AGENT_PORT || "8765",
  },
});

// 2) Node server (Express + static + /api + socket.io + proxy /tcs-agent).
run("web", process.execPath, ["server/index.mjs"], { cwd: root });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => shutdown(0));
}
