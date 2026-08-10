/**
 * Thiết lập Variables + volume portal online trên Railway (không máy kho).
 * Đọc credential từ tcs-awb-automation/.env.hub + .env.tcs (gitignore).
 *
 * Usage: node scripts/railway-setup-online-portal.mjs
 *        node scripts/railway-setup-online-portal.mjs --deploy
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import {
  applyRailwayProjectTokenEnv,
  projectRoot,
} from "./loadProjectEnv.mjs";

const SERVICE = process.env.RAILWAY_SERVICE?.trim() || "chic-nurturing";
const wantDeploy = process.argv.includes("--deploy");

/** Volume hiện có mount tại browser_profile — dùng subdir cho 2 kho (tránh CLI volume add lỗi). */
const VOLUME_ROOT = "/app/tcs-awb-automation/browser_profile";
const HUB_PROFILE = `${VOLUME_ROOT}/hub`;
const TCS_PROFILE = `${VOLUME_ROOT}/tcs`;
const OUTPUT_DIR = `${VOLUME_ROOT}/output`;

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function rail(args, { inherit = false } = {}) {
  const r = spawnSync("railway", args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: inherit ? "inherit" : "pipe",
  });
  return {
    status: r.status ?? 1,
    out: `${r.stdout || ""}${r.stderr || ""}`.trim(),
  };
}

function parseEnvFile(path) {
  const map = {};
  if (!fs.existsSync(path)) return map;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

function mask(s) {
  const t = String(s || "");
  if (t.length <= 3) return "***";
  return `${t.slice(0, 3)}…(${t.length})`;
}

const token = applyRailwayProjectTokenEnv();
if (!token) fail("Thiếu RAILWAY_TOKEN trong .env.local");

const hub = parseEnvFile(join(projectRoot, "tcs-awb-automation", ".env.hub"));
const tcs = parseEnvFile(join(projectRoot, "tcs-awb-automation", ".env.tcs"));

const hubUser = String(hub.TCS_USERNAME || "").trim();
const hubPass = String(hub.TCS_PASSWORD || "");
const tcsUser = String(tcs.TCS_USERNAME || "").trim();
const tcsPass = String(tcs.TCS_PASSWORD || "");

if (!hubUser || !hubPass) fail("Thiếu TCS_USERNAME/PASSWORD trong .env.hub");
if (!tcsUser || !tcsPass) fail("Thiếu TCS_USERNAME/PASSWORD trong .env.tcs");
if (hubUser === tcsUser) {
  fail("User hub và TCS trùng nhau — hai kho phải khác tài khoản portal");
}

console.log(`[railway-setup] Service: ${SERVICE}`);
console.log(`[railway-setup] Hub user: ${mask(hubUser)}`);
console.log(`[railway-setup] TCS user: ${mask(tcsUser)}`);

// Volumes
const volList = rail(["volume", "list", "--json"]);
if (volList.status !== 0) fail(`volume list failed:\n${volList.out}`);
let volumes = [];
try {
  volumes = JSON.parse(volList.out).volumes || [];
} catch {
  fail(`Không parse volume list:\n${volList.out.slice(0, 400)}`);
}

const appVols = volumes.filter((v) => v.serviceName === SERVICE);
const hasRootVol = appVols.some((v) => v.mountPath === VOLUME_ROOT);

console.log(
  `[railway-setup] Volumes app: ${appVols
    .map((v) => `${v.name}@${v.mountPath}`)
    .join(" | ") || "(none)"}`
);

if (!hasRootVol) {
  console.log(`[railway-setup] Thêm volume → ${VOLUME_ROOT}`);
  const add = rail([
    "volume",
    "--service",
    SERVICE,
    "add",
    "--mount-path",
    VOLUME_ROOT,
    "--json",
  ]);
  if (add.status !== 0) {
    fail(
      `volume add failed (CLI):\n${add.out}\n` +
        "Thêm thủ công trên Dashboard: Volumes → mount " +
        VOLUME_ROOT
    );
  }
  console.log("✅ Volume OK");
} else {
  console.log(
    `✅ Volume đã gắn ${VOLUME_ROOT} — dùng subdir hub/ + tcs/ + output/`
  );
}

const vars = {
  TCS_USERNAME: hubUser,
  TCS_PASSWORD: hubPass,
  TCS_USERNAME_TCS: tcsUser,
  TCS_PASSWORD_TCS: tcsPass,
  TCS_AGENT_DUAL: "1",
  TCS_AGENT_PROXY: "1",
  TCS_HEADLESS: "1",
  TCS_AUTO_OPEN: "1",
  TCS_CAPTCHA_OCR: "1",
  TCS_PREFER_SESSION: "1",
  TCS_AGENT_URL: "http://127.0.0.1:8765",
  TCS_AGENT_URL_TCS: "http://127.0.0.1:8766",
  TCS_BROWSER_PROFILE: HUB_PROFILE,
  TCS_BROWSER_PROFILE_TCS: TCS_PROFILE,
  TCS_OUTPUT_DIR: OUTPUT_DIR,
};

console.log("\n[railway-setup] Set variables…");
for (const [key, val] of Object.entries(vars)) {
  // stdin tránh lỗi escape ký tự đặc biệt (@, #) trên Windows shell
  const r = spawnSync(
    "railway",
    [
      "variable",
      "set",
      key,
      "--stdin",
      "--service",
      SERVICE,
      "--skip-deploys",
    ],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
      input: String(val),
    }
  );
  if ((r.status ?? 1) !== 0) {
    fail(`Set ${key} failed:\n${r.stdout || ""}${r.stderr || ""}`);
  }
  const shown =
    /PASSWORD/i.test(key) || /SECRET/i.test(key) ? mask(val) : val;
  console.log(`  ✅ ${key}=${shown}`);
}

console.log("\n[railway-setup] Xong Variables + volumes.");
console.log("  Ops: https://ops-production-b405.up.railway.app");
console.log("  Docs: docs/railway-online-portal.md");

if (wantDeploy) {
  console.log("\n[railway-setup] ▶ railway up --detach …");
  const up = rail(
    ["up", "--detach", "--service", SERVICE, "--skip-deploys"],
    { inherit: false }
  );
  // skip-deploys may not exist — try normal up
  if (up.status !== 0) {
    const up2 = rail(["up", "--detach", "--service", SERVICE], {
      inherit: true,
    });
    process.exit(up2.status);
  }
  console.log(up.out);
}

console.log(
  "\nGợi ý: redeploy để nhận password/profile mới:\n  npm run railway:up -- --skip-token-check\n"
);
