/**
 * Proxy same-origin `/tcs-agent/*` → agent Playwright trên máy kho.
 *
 * Dual agent (auto parity TECS-TCS / TCS):
 *   Header `X-Portal-Warehouse: TCS` → TCS_AGENT_URL_TCS (mặc định :8766)
 *   Còn lại / TECS-TCS → TCS_AGENT_URL (mặc định :8765)
 *
 * Local: `npm run dev` tự spawn agent hub. Railway: production tắt proxy mặc định.
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

function normalizeBase(raw, fallback) {
  const t = String(raw || "").trim().replace(/\/$/, "");
  return t || fallback;
}

export function agentTargetForWarehouse(warehouse) {
  const wh = String(warehouse || "")
    .trim()
    .toUpperCase();
  if (wh === "TCS") {
    return normalizeBase(
      process.env.TCS_AGENT_URL_TCS || process.env.TCS_AGENT_URL_DIRECT,
      "http://127.0.0.1:8766"
    );
  }
  return normalizeBase(process.env.TCS_AGENT_URL, "http://127.0.0.1:8765");
}

function agentTarget() {
  return agentTargetForWarehouse("TECS-TCS");
}

export function isAgentHealthProbe(pathname) {
  const normalized = String(pathname || "").toLowerCase().replace(/\/+$/, "");
  return normalized === "/health";
}

/** Export để unit test — production mặc định tắt trừ khi TCS_AGENT_PROXY=1 (Docker set sẵn). */
export function isTcsAgentProxyEnabled() {
  const raw = process.env.TCS_AGENT_PROXY;
  if (raw === undefined || String(raw).trim() === "") {
    return process.env.NODE_ENV !== "production";
  }
  const flag = String(raw).trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

/** TCS_AGENT_ENABLED=0: không spawn Python — proxy trả AGENT_OFF, không treo. */
export function isTcsAgentProcessEnabled() {
  const raw = process.env.TCS_AGENT_ENABLED;
  if (raw == null || String(raw).trim() === "") return true;
  const flag = String(raw).trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off";
}

export function registerTcsAgentProxy(app) {
  if (!isTcsAgentProxyEnabled()) {
    console.info("[tcs-agent-proxy] tắt (production mặc định hoặc TCS_AGENT_PROXY=0)");
    return;
  }

  const hub = agentTargetForWarehouse("TECS-TCS");
  const tcs = agentTargetForWarehouse("TCS");
  const isProduction = process.env.NODE_ENV === "production";
  if (!isTcsAgentProcessEnabled()) {
    console.info("[tcs-agent-proxy] TCS_AGENT_ENABLED=0 — /tcs-agent trả AGENT_OFF");
    app.use("/tcs-agent", (_req, res) => {
      res.status(200).json({
        ok: false,
        error: "AGENT_OFF",
        offline: true,
        message: "Agent Python tắt (TCS_AGENT_ENABLED=0).",
      });
    });
    return;
  }
  console.info(`[tcs-agent-proxy] /tcs-agent → hub ${hub} · TCS ${tcs} (header X-Portal-Warehouse)`);

  app.use("/tcs-agent", (req, res) => {
    const warehouse = String(
      req.get("x-portal-warehouse") || req.query?.warehouse || ""
    ).trim();
    const targetBase = agentTargetForWarehouse(warehouse);
    let target;
    try {
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

    // bootstrap / jobs / declare / session-open có thể >3 phút khi agent xếp hàng
    const pathLower = String(target.pathname || "").toLowerCase();
    const healthProbe = isAgentHealthProbe(pathLower);
    const longOp =
      pathLower.includes("/workspace/bootstrap") ||
      pathLower.includes("/jobs") ||
      pathLower.includes("/esid/") ||
      pathLower.includes("/session/open") ||
      pathLower.includes("/workspace/prefetch");
    const upstreamTimeoutMs = longOp ? 360_000 : 60_000;

    const upstream = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers,
        timeout: upstreamTimeoutMs,
      },
      (upRes) => {
        const outHeaders = { ...upRes.headers };
        for (const key of [
          "connection",
          "keep-alive",
          "proxy-connection",
          "te",
          "trailer",
          "upgrade",
        ]) {
          delete outHeaders[key];
        }
        if (outHeaders["content-length"] != null) {
          delete outHeaders["transfer-encoding"];
        }
        res.writeHead(upRes.statusCode || 502, outHeaders);
        upRes.pipe(res);
      }
    );

    upstream.on("timeout", () => {
      upstream.destroy();
      if (!res.headersSent) {
        res.status(healthProbe ? 200 : 504).json({
          ok: false,
          error: "AGENT_PROXY_TIMEOUT",
          offline: healthProbe,
          message:
            "Agent TCS không trả lời (timeout). Kiểm tra agent :8765 / :8766 trên máy kho.",
        });
      }
    });

    upstream.on("error", (err) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(healthProbe ? 200 : 502).json({
        ok: false,
        error: "AGENT_OFFLINE",
        offline: healthProbe,
        message: isProduction
          ? "Agent TCS đang offline."
          : `Không nối được agent (${targetBase}, kho=${warehouse || "TECS-TCS"}). ` +
            "Local: npm run portal:start:both hoặc npm run dev. " +
            "Máy khác: mở Ops bằng IP máy kho — không dùng 127.0.0.1.",
        ...(isProduction ? {} : { detail: String(err?.message || err) }),
      });
    });

    req.pipe(upstream);
  });
}

// giữ export cũ cho chỗ gọi agentTarget nếu có
export { agentTarget };
