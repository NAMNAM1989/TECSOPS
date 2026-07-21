/**
 * Proxy same-origin `/tcs-desktop/*` → noVNC (websockify) trên 127.0.0.1:6080.
 * Bắt buộc WebSocket upgrade để thao tác chuột/phím trên Chrome agent (Xvfb).
 */
import http from "node:http";
import httpProxy from "http-proxy";

function novncTarget() {
  const port = Number(process.env.TCS_NOVNC_PORT || 6080);
  return `http://127.0.0.1:${port}`;
}

function isDesktopEnabled() {
  const flag = (process.env.TCS_VNC || "1").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

/**
 * @param {import("express").Express} app
 * @param {import("node:http").Server} httpServer
 */
export function registerTcsDesktopProxy(app, httpServer) {
  if (!isDesktopEnabled()) {
    console.info("[tcs-desktop-proxy] tắt (TCS_VNC=0)");
    return;
  }

  const target = novncTarget();
  const proxy = httpProxy.createProxyServer({
    target,
    ws: true,
    changeOrigin: true,
    xfwd: true,
  });

  proxy.on("error", (err, _req, res) => {
    console.error("[tcs-desktop-proxy]", err?.message || err);
    if (res && !res.headersSent && typeof res.writeHead === "function") {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          error: "TCS_DESKTOP_OFFLINE",
          message:
            "noVNC chưa sẵn sàng. Container cần TCS_VNC=1 (Xvfb + websockify). " +
            "Kiểm tra logs start-fullstack / TCS_VNC_PASSWORD.",
          detail: String(err?.message || err),
        })
      );
    } else if (res && typeof res.end === "function") {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  });

  console.info(`[tcs-desktop-proxy] /tcs-desktop → ${target}`);

  app.use("/tcs-desktop", (req, res) => {
    // Express strip mount: req.url = /vnc.html?...
    proxy.web(req, res, { target });
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    if (!url.startsWith("/tcs-desktop")) return;
    // Strip prefix so websockify sees /websockify
    req.url = url.replace(/^\/tcs-desktop/, "") || "/";
    proxy.ws(req, socket, head, { target });
  });

  // Health hint (không lộ password)
  app.get("/api/tcs-desktop", (_req, res) => {
    res.json({
      ok: true,
      enabled: true,
      path: "/tcs-desktop/vnc.html",
      hint:
        "Mở /tcs-desktop/vnc.html?autoconnect=1&resize=scale&path=tcs-desktop/websockify" +
        (process.env.TCS_VNC_PASSWORD?.trim()
          ? " — nhập mật khẩu TCS_VNC_PASSWORD"
          : " — không cần mật khẩu VNC"),
    });
  });
}

/** Smoke: noVNC có lắng nghe không (dùng khi debug). */
export function probeNovnc(timeoutMs = 800) {
  return new Promise((resolve) => {
    const port = Number(process.env.TCS_NOVNC_PORT || 6080);
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
