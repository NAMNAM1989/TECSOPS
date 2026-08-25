import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [
      ["server/**", "node"],
      ["scripts/**", "node"],
      // Tests đọc file/path Node — không chạy dưới jsdom (fs bị externalize).
      ["src/utils/tcsDimRecordForm.test.ts", "node"],
    ],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "server/**/*.test.mjs",
      "scripts/**/*.test.mjs",
    ],
  },
});
