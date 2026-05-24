/**
 * Gắn biến eCargo + REDIS_URL (reference service Redis) lên Railway app.
 * Usage: node scripts/railway-set-ecargo-env.mjs
 *
 * Cần RAILWAY_TOKEN trong .env.local. KHÔNG copy REDIS_URL localhost.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = process.env.RAILWAY_SERVICE?.trim() || "chic-nurturing";
const REDIS_SERVICE = process.env.RAILWAY_REDIS_SERVICE?.trim() || "Redis";

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

function setVar(key, value) {
  console.info(`[set] ${key} → service ${SERVICE}`);
  const r = spawnSync("railway", ["variable", "set", `${key}=${value}`, "-s", SERVICE], {
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

// Reference Redis plugin trên Railway (internal URL)
setVar("REDIS_URL", `\${{${REDIS_SERVICE}.REDIS_URL}}`);
setVar("ECARGO_WORKER_ENABLED", "1");

for (const key of ["ECARGO_GMAIL_USER", "ECARGO_GMAIL_APP_PASSWORD", "ECARGO_CONTACT_EMAIL"]) {
  const val = process.env[key]?.trim();
  if (!val) {
    console.warn(`[skip] ${key} — chưa có trong .env.local`);
    continue;
  }
  setVar(key, val);
}

console.info("\n[railway-set-ecargo-env] Xong. Railway sẽ tự redeploy khi set biến.");
try {
  execSync(`railway variable list -s ${SERVICE} -k`, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: true,
  });
} catch {
  /* optional list */
}
