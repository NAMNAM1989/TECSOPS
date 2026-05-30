/**
 * Gắn biến eCargo + REDIS_URL (reference service Redis) lên Railway app.
 * Usage: node scripts/railway-set-ecargo-env.mjs
 *
 * Cần RAILWAY_TOKEN trong .env.local. KHÔNG copy REDIS_URL localhost.
 */
import { execSync, spawnSync } from "node:child_process";
import { applyRailwayProjectTokenEnv, projectRoot } from "./loadProjectEnv.mjs";

const root = projectRoot;
const SERVICE = process.env.RAILWAY_SERVICE?.trim() || "chic-nurturing";
const REDIS_SERVICE = process.env.RAILWAY_REDIS_SERVICE?.trim() || "Redis";

const token = applyRailwayProjectTokenEnv();
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
setVar("ECARGO_QR_WAIT_MODE", "on_demand");
setVar("ECARGO_QR_POLL_MODE", "single");
setVar("ECARGO_QR_INBOX_ONLY", "1");

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
