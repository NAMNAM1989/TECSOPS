/**
 * Khởi động desktop ảo cho Chrome agent trên Railway/Docker:
 * Xvfb (:99) → fluxbox → x11vnc (:5900) → websockify/noVNC (:6080 localhost).
 *
 * Express proxy `/tcs-desktop` → 127.0.0.1:6080 (HTTP + WebSocket).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

export function isTcsVncEnabled() {
  // Mặc định tắt (API-first). Bật tường minh: TCS_VNC=1
  const flag = (process.env.TCS_VNC || "0").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function canConnect(host, port, timeoutMs = 400) {
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

async function waitPort(host, port, maxMs = 15_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await canConnect(host, port)) return true;
    await sleep(250);
  }
  return false;
}

function resolveNovncWebRoot() {
  const candidates = [
    "/usr/share/novnc",
    "/usr/share/novnc/www",
    "/usr/local/share/novnc",
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "vnc.html"))) return c;
  }
  return "/usr/share/novnc";
}

function writeVncPassfile(password) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tcs-vnc-"));
  const passfile = path.join(dir, "passwd");
  // x11vnc -storepasswd writes binary passfile
  const r = spawnSync("x11vnc", ["-storepasswd", password, passfile], {
    encoding: "utf8",
  });
  if (r.status !== 0 || !fs.existsSync(passfile)) {
    throw new Error(
      `Không tạo được VNC passfile: ${r.stderr || r.stdout || r.error || "unknown"}`
    );
  }
  return passfile;
}

/**
 * @param {import("node:child_process").ChildProcess[]} children
 * @param {{ onFatal?: (code:number|null) => void }} [opts]
 */
export async function startTcsDesktop(children, opts = {}) {
  if (process.platform === "win32") {
    console.info("[tcs-desktop] bỏ qua trên Windows — dùng Chrome headed local");
    return { ok: false, reason: "windows" };
  }

  const display = (process.env.DISPLAY || ":99").trim() || ":99";
  const vncPort = Number(process.env.TCS_VNC_PORT || 5900);
  const novncPort = Number(process.env.TCS_NOVNC_PORT || 6080);
  // Có mật khẩu chỉ khi set TCS_VNC_PASSWORD (không trống). Mặc định: không pass (-nopw).
  const password = String(process.env.TCS_VNC_PASSWORD || "").trim();
  const useAuth = Boolean(password);
  if (!useAuth) {
    console.info("[tcs-desktop] VNC không mật khẩu (TCS_VNC_PASSWORD trống) — -nopw");
  }

  const track = (name, child, { fatal = true } = {}) => {
    children.push(child);
    child.on("exit", (code, signal) => {
      console.error(`[tcs-desktop] ✖ ${name} thoát (code=${code} signal=${signal})`);
      if (fatal && opts.onFatal) opts.onFatal(code ?? 1);
    });
    child.on("error", (err) => {
      console.error(`[tcs-desktop] ✖ ${name} lỗi: ${err?.message || err}`);
      if (fatal && opts.onFatal) opts.onFatal(1);
    });
    return child;
  };

  console.info(`[tcs-desktop] Xvfb ${display} …`);
  track(
    "Xvfb",
    spawn("Xvfb", [display, "-screen", "0", "1366x900x24", "-ac", "+extension", "RANDR"], {
      stdio: "inherit",
      env: { ...process.env, DISPLAY: display },
    })
  );
  await sleep(800);

  console.info("[tcs-desktop] fluxbox …");
  track(
    "fluxbox",
    spawn("fluxbox", [], {
      stdio: "ignore",
      env: { ...process.env, DISPLAY: display },
    }),
    { fatal: false }
  );
  await sleep(400);

  const x11Args = [
    "-display",
    display,
    "-rfbport",
    String(vncPort),
    "-localhost",
    "-forever",
    "-shared",
    "-noxdamage",
    "-repeat",
  ];
  if (useAuth) {
    x11Args.push("-rfbauth", writeVncPassfile(password));
  } else {
    x11Args.push("-nopw");
  }

  console.info(`[tcs-desktop] x11vnc :${vncPort} (localhost) …`);
  track(
    "x11vnc",
    spawn("x11vnc", x11Args, {
      stdio: "inherit",
      env: { ...process.env, DISPLAY: display },
    })
  );

  if (!(await waitPort("127.0.0.1", vncPort))) {
    throw new Error(`x11vnc không lắng nghe :${vncPort}`);
  }

  const webRoot = resolveNovncWebRoot();
  console.info(`[tcs-desktop] noVNC/websockify 127.0.0.1:${novncPort} web=${webRoot}`);
  track(
    "websockify",
    spawn(
      "websockify",
      [
        `--web=${webRoot}`,
        `127.0.0.1:${novncPort}`,
        `localhost:${vncPort}`,
      ],
      { stdio: "inherit", env: { ...process.env, DISPLAY: display } }
    )
  );

  if (!(await waitPort("127.0.0.1", novncPort))) {
    throw new Error(`websockify/noVNC không lắng nghe :${novncPort}`);
  }

  console.info(
    `[tcs-desktop] OK — Ops mở /tcs-desktop/vnc.html` +
      (useAuth ? " (có VNC password)" : " (không password)")
  );
  return {
    ok: true,
    display,
    vncPort,
    novncPort,
    webRoot,
  };
}
