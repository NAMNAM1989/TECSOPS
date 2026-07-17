import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
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
