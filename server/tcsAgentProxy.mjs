/**
 * Proxy same-origin `/tcs-agent/*` → agent Playwright trên máy kho (localhost:8765).
 *
 * Máy khác mở Ops qua IP máy kho → browser chỉ gọi cùng origin → Express
 * chuyển tiếp tới agent local. Agent không cần bind 0.0.0.0 / mở firewall rộng.
 *
 * Local: `npm run dev` tự spawn agent. Railway all-in-one: start-fullstack chạy agent trong container.
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

function agentTarget() {
  const raw = (process.env.TCS_AGENT_URL || "http://127.0.0.1:8765").trim();
  return raw.replace(/\/$/, "") || "http://127.0.0.1:8765";
}

function isProxyEnabled() {
  const flag = (process.env.TCS_AGENT_PROXY || "1").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

export function registerTcsAgentProxy(app) {
  if (!isProxyEnabled()) {
    console.info("[tcs-agent-proxy] tắt (TCS_AGENT_PROXY=0)");
    return;
  }

  const targetBase = agentTarget();
  console.info(`[tcs-agent-proxy] /tcs-agent → ${targetBase}`);

  app.use("/tcs-agent", (req, res) => {
    let target;
    try {
      // Express strip prefix: req.url bắt đầu bằng /health, /jobs, ...
      target = new URL(req.url || "/", `${targetBase}/`);
    } catch {
      res.status(502).json({
        ok: false,
        error: "AGENT_PROXY_BAD_TARGET",
        message: `URL agent không hợp lệ: ${targetBase}`,
      });
      return;
    }

    const isHttps = target.protocol === "https:";
    const lib = isHttps ? https : http;
    const headers = { ...req.headers, host: target.host };
    delete headers["connection"];

    const upstream = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
        timeout: 180_000,
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      }
    );

    upstream.on("timeout", () => {
      upstream.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          ok: false,
          error: "AGENT_PROXY_TIMEOUT",
          message: "Agent TCS không trả lời (timeout). Kiểm tra npm run tcs:agent:real trên máy kho.",
        });
      }
    });

    upstream.on("error", (err) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(502).json({
        ok: false,
        error: "AGENT_OFFLINE",
        message:
          `Không nối được agent TCS (${targetBase}). ` +
          "Local: npm run dev (tự chạy agent) hoặc npm run tcs:agent:real. " +
          "Máy khác: mở Ops bằng IP máy kho — không dùng 127.0.0.1.",
        detail: String(err?.message || err),
      });
    });

    req.pipe(upstream);
  });
}
