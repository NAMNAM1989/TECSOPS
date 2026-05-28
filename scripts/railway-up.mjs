/**
 * Deploy Railway CLI với RAILWAY_TOKEN từ .env / .env.local (không commit).
 * Project token đã gắn project — không cần railway link.
 */
import { execSync, spawnSync } from "node:child_process";
import {
  applyRailwayProjectTokenEnv,
  projectRoot,
} from "./loadProjectEnv.mjs";

const root = projectRoot;

const token = applyRailwayProjectTokenEnv();
if (!token) {
  fail("Thiếu RAILWAY_TOKEN trong .env.local");
  printHowToPaste();
  process.exit(1);
}

if (process.argv.includes("--skip-token-check")) {
  console.log("[railway:up] Bỏ qua railway:check (--skip-token-check)\n");
} else {
  console.info("[railway:up] Kiểm tra token (npm run railway:check)…\n");
  const check = spawnSync(process.execPath, ["scripts/railway-check-token.mjs"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if ((check.status ?? 1) !== 0) {
    process.exit(check.status ?? 1);
  }
}

const skipBuild = process.argv.includes("--skip-build");
if (!skipBuild) {
  console.info("\n[railway:up] ▶ npm run build\n");
  execSync("npm run build", { stdio: "inherit", cwd: root, env: process.env });
}

const detach = !process.argv.includes("--no-detach");
const service =
  process.env.RAILWAY_SERVICE?.trim() ||
  process.argv.find((a, i) => process.argv[i - 1] === "--service")?.trim() ||
  "chic-nurturing";
const args = ["up", ...(detach ? ["--detach"] : []), "--service", service];

console.info("[railway:up] ▶ railway", args.join(" "), "\n");
const r = spawnSync("railway", args, {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: process.platform === "win32",
});

if ((r.status ?? 1) !== 0) {
  console.error(
    "\n[railway:up] Deploy thất bại.\n" +
      "  • Chạy lại: npm run railway:check\n" +
      "  • Token phải là **Project token** (Project Settings → Tokens), không phải Account token\n" +
      "  • Xóa OAuth cũ: railway logout\n" +
      "  • Xóa token Windows cũ: [Environment]::SetEnvironmentVariable('RAILWAY_TOKEN',$null,'User')\n",
  );
}
process.exit(r.status ?? 1);
