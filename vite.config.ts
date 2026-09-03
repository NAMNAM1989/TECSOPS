import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

/**
 * Không preload chunk nặng / route phụ.
 * Không manualChunks src/pages|components — dễ kéo shared module vào chunk “lazy”
 * khiến entry import ngược (page-customers / print / dim trên first load).
 */
function shouldModulePreload(dep: string): boolean {
  if (dep.includes("CustomersPage") || dep.includes("page-customers")) return false;
  if (dep.includes("PrintShippingLabel") || dep.includes("page-print")) return false;
  if (dep.includes("OpsStatsPage") || dep.includes("OpsStatsCharts")) return false;
  if (dep.includes("vendor-excel")) return false;
  if (dep.includes("vendor-recharts")) return false;
  if (dep.includes("MobileDimKgModal") || dep.includes("feature-dim-modal")) return false;
  if (dep.includes("ScscH21") || dep.includes("TcsH21")) return false;
  if (dep.includes("AirlinesLabels")) return false;
  if (dep.includes("fonts-deferred")) return false;
  return true;
}

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
    },
  },
  build: {
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => shouldModulePreload(dep)),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client")) {
            return "vendor-socketio";
          }
          if (id.includes("node_modules/exceljs")) {
            return "vendor-excel";
          }
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/react-smooth") ||
            id.includes("node_modules/recharts-scale")
          ) {
            return "vendor-recharts";
          }
          if (id.includes("node_modules/@fontsource/")) {
            return "vendor-fonts";
          }
        },
      },
    },
  },
});
