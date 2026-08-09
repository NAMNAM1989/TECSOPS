import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

const tcsAgentTargetHub = (
  process.env.VITE_TCS_AGENT_PROXY_TARGET ||
  process.env.TCS_AGENT_URL ||
  "http://127.0.0.1:8765"
).replace(/\/$/, "");
const tcsAgentTargetTcs = (
  process.env.VITE_TCS_AGENT_PROXY_TARGET_TCS ||
  process.env.TCS_AGENT_URL_TCS ||
  "http://127.0.0.1:8766"
).replace(/\/$/, "");

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0: máy khác trong LAN mở http://IP-máy-kho:5173
    host: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/socket.io": {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
      // Same-origin → agent theo kho (header X-Portal-Warehouse)
      "/tcs-agent": {
        target: tcsAgentTargetHub,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tcs-agent/, ""),
        router: (req) => {
          const wh = String(req.headers["x-portal-warehouse"] || "")
            .trim()
            .toUpperCase();
          return wh === "TCS" ? tcsAgentTargetTcs : tcsAgentTargetHub;
        },
        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            const wh = String(req?.headers?.["x-portal-warehouse"] || "")
              .trim()
              .toUpperCase();
            const target =
              wh === "TCS" ? tcsAgentTargetTcs : tcsAgentTargetHub;
            const body = JSON.stringify({
              ok: false,
              error: "AGENT_OFFLINE",
              message:
                `Không nối được agent TCS (${target}, kho=${wh || "TECS-TCS"}). ` +
                "`npm run portal:start:both` hoặc `npm run dev`. " +
                "Máy khác: mở Ops bằng IP máy kho (không dùng 127.0.0.1).",
              detail: String(err?.message || err),
            });
            if (res && typeof res.writeHead === "function" && !res.headersSent) {
              res.writeHead(502, {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": Buffer.byteLength(body),
              });
              res.end(body);
            }
          });
        },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client")) {
            return "vendor-socketio";
          }
          if (id.includes("node_modules/exceljs")) {
            return "vendor-excel";
          }
          if (id.includes("/src/pages/CustomersPage") || id.includes("/src/components/customerDirectory/")) {
            return "page-customers";
          }
          if (id.includes("/src/components/PrintShippingLabel") || id.includes("/src/printing/")) {
            return "page-print";
          }
        },
      },
    },
  },
});
