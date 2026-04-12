import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Trùng với `PORT` của `server/index.mjs` (mặc định 3001). Khi đổi cổng API: `set PORT=3020` và `set VITE_PROXY_PORT=3020` */
const apiPort = process.env.VITE_PROXY_PORT ?? "3001";
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/socket.io": {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
