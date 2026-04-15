/**
 * Một lệnh deploy an toàn: nạp .env/.env.local (nếu có) → deploy:safe → git push.
 * Dữ liệu production phụ thuộc Redis trên Railway (REDIS_URL cố định) — script nhắc backup khi có REDIS_URL.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function mergeEnvFile(rel) {
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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env, ...opts });
}

mergeEnvFile(".env");
mergeEnvFile(".env.local");

console.info(
  "\n[deploy:ship] Nhắc an toàn dữ liệu: trên Railway, service app phải luôn có REDIS_URL trỏ cùng một Redis production " +
    "(không ALLOW_FILE_STATE_ON_RAILWAY). Chi tiết: .cursor/skills/tecsops-railway-state-persistence/SKILL.md\n"
);

try {
  execSync("git remote get-url origin", { stdio: "pipe", cwd: root, env: process.env });
} catch {
  console.error("[deploy:ship] Không có remote origin — thêm remote rồi chạy lại.");
  process.exit(1);
}

console.info("\n[deploy:ship] ▶ npm run deploy:safe\n");
sh("npm run deploy:safe");

const dirty = execSync("git status --porcelain", { encoding: "utf8", cwd: root, env: process.env }).trim();
if (dirty) {
  console.error(
    "\n[deploy:ship] Thất bại: còn thay đổi chưa commit.\n" +
      "  Chạy: git add … → git commit -m \"…\" — rồi: npm run deploy:ship\n"
  );
  process.exit(1);
}

const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  encoding: "utf8",
  cwd: root,
  env: process.env,
}).trim();
console.info(`\n[deploy:ship] ▶ git push -u origin HEAD (nhánh hiện tại: ${branch})\n`);
sh("git push -u origin HEAD");

const verify = process.env.TECSOPS_VERIFY_URL?.trim().replace(/\/$/, "");
if (verify) {
  const healthUrl = `${verify}/api/health`;
  console.info(`\n[deploy:ship] ▶ GET ${healthUrl}\n`);
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(25_000) });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[deploy:ship] Health không OK: HTTP ${res.status} — ${text.slice(0, 200)}`);
      process.exit(1);
    }
    console.info(`[deploy:ship] Health OK (${res.status}): ${text.slice(0, 120)}`);
  } catch (e) {
    console.error("[deploy:ship] Không gọi được health:", e?.message ?? e);
    process.exit(1);
  }
} else {
  console.info(
    "\n[deploy:ship] Gợi ý: set TECSOPS_VERIFY_URL trong .env (URL production, không dấu / cuối) để script tự kiểm tra /api/health sau push.\n"
  );
}

console.info("\n[deploy:ship] Hoàn tất. Railway (nếu nối GitHub) sẽ build/deploy từ commit vừa push.\n");
