/**
 * Ghi biến eCargo + REDIS lên Railway (cần RAILWAY_TOKEN hợp lệ trong .env.local).
 * Usage: node scripts/railway-set-ecargo-env.mjs
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

mergeEnvFile(".env");
mergeEnvFile(".env.local", { override: true });
delete process.env.RAILWAY_API_TOKEN;

const token = process.env.RAILWAY_TOKEN?.trim();
if (!token) {
  console.error("[railway-set-ecargo-env] Thiếu RAILWAY_TOKEN trong .env.local");
  process.exit(1);
}

const keys = [
  "REDIS_URL",
  "ECARGO_GMAIL_USER",
  "ECARGO_GMAIL_APP_PASSWORD",
  "ECARGO_CONTACT_EMAIL",
];

for (const key of keys) {
  const val = process.env[key]?.trim();
  if (!val) {
    console.warn(`[skip] ${key} — chưa có trong .env.local`);
    continue;
  }
  console.info(`[set] ${key}`);
  const r = spawnSync("railway", ["variables", "set", `${key}=${val}`], {
    cwd: root,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`[fail] ${key}`);
    process.exit(r.status ?? 1);
  }
}

console.info("\n[railway-set-ecargo-env] Xong. Redeploy service để worker nhận biến mới.");
try {
  execSync("railway variables", { cwd: root, env: process.env, stdio: "inherit", shell: true });
} catch {
  /* optional list */
}
