import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

const tcsAgentTarget = (process.env.VITE_TCS_AGENT_PROXY_TARGET || "http://127.0.0.1:8765").replace(
  /\/$/,
  ""
);

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
      // Same-origin → agent Playwright trên máy kho (không lộ :8765 ra LAN)
      "/tcs-agent": {
        target: tcsAgentTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tcs-agent/, ""),
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            // Tránh HTTP 500 opaque — FE đọc được AGENT_OFFLINE
            const body = JSON.stringify({
              ok: false,
              error: "AGENT_OFFLINE",
              message:
                `Không nối được agent TCS (${tcsAgentTarget}). ` +
                "`npm run dev` sẽ tự chạy agent; hoặc chạy riêng: npm run tcs:agent:real. " +
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
