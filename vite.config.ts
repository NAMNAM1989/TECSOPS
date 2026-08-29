import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

/** Không preload chunk lazy không thuộc route đang mở (Ops). */
function shouldModulePreload(dep: string): boolean {
  if (dep.includes("page-customers")) return false;
  if (dep.includes("page-print")) return false;
  if (dep.includes("OpsStatsPage")) return false;
  if (dep.includes("vendor-excel")) return false;
  if (dep.includes("PDFButton")) return false;
  if (dep.includes("MobileDimKgModal")) return false;
  if (dep.includes("feature-dim-modal")) return false;
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
          if (id.includes("node_modules/socket.io-client") || id.includes("node_modules/engine.io-client")) {
            return "vendor-socketio";
          }
          if (id.includes("node_modules/exceljs")) {
            return "vendor-excel";
          }
          if (id.includes("node_modules/@fontsource/")) {
            return "vendor-fonts";
          }
          if (id.includes("/src/pages/CustomersPage") || id.includes("/src/components/customerDirectory/")) {
            return "page-customers";
          }
          if (id.includes("/src/components/PrintShippingLabel") || id.includes("/src/printing/")) {
            return "page-print";
          }
          if (
            id.includes("/src/components/MobileDimKgModal") ||
            id.includes("/src/utils/dimEntryState")
          ) {
            return "feature-dim-modal";
          }
        },
      },
    },
  },
});
