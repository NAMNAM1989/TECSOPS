/**
 * Deploy Railway CLI với RAILWAY_TOKEN từ .env / .env.local (không commit).
 * Project token đã gắn project — không cần railway link.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function mergeEnvFile(rel, { override = false } = {}) {
  const p = join(root, rel);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = val;
  }
}

// .env.local luôn thắng (tránh token cũ trong biến Windows ghi đè file dự án)
mergeEnvFile(".env");
mergeEnvFile(".env.local", { override: true });

// Railway CLI: chỉ một loại token; project token ưu tiên cho deploy.
delete process.env.RAILWAY_API_TOKEN;

let token = process.env.RAILWAY_TOKEN?.trim();
if (token?.startsWith("Bearer ")) token = token.slice(7).trim();
if (!token) {
  console.error(
    "[railway:up] Thiếu RAILWAY_TOKEN.\n" +
      "  1. Railway → project chic-nurturing → Settings → Tokens → Create project token\n" +
      "  2. Thêm vào .env.local (không commit):\n" +
      "     RAILWAY_TOKEN=your-project-token\n" +
      "  Xem .env.example mục Railway CLI.\n"
  );
  process.exit(1);
}

const skipBuild = process.argv.includes("--skip-build");
if (!skipBuild) {
  console.info("[railway:up] ▶ npm run build\n");
  execSync("npm run build", { stdio: "inherit", cwd: root, env: process.env });
}

const detach = !process.argv.includes("--no-detach");
const args = ["up", ...(detach ? ["--detach"] : [])];

console.info("[railway:up] ▶ railway", args.join(" "), "\n");
const r = spawnSync("railway", args, {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: process.platform === "win32",
});

if ((r.status ?? 1) !== 0 && token) {
  console.error(
    "\n[railway:up] Token bị Railway từ chối (độ dài hiện tại: " +
      token.length +
      "). Kiểm tra:\n" +
      "  • Lấy **Project Token**: project chic-nurturing → **Project Settings** → **Tokens** → Create\n" +
      "  • Không dùng Deploy Hook URL hay mã ngắn không phải token Railway\n" +
      "  • Cập nhật .env.local rồi xóa token cũ Windows:\n" +
      "    [Environment]::SetEnvironmentVariable('RAILWAY_TOKEN',$null,'User')\n"
  );
}
process.exit(r.status ?? 1);
