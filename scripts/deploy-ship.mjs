/**
 * Một lệnh deploy an toàn: nạp .env/.env.local (nếu có) → deploy:safe → git push.
 * Nếu push báo "Everything up-to-date", tự kích hoạt build lại: POST RAILWAY_DEPLOY_HOOK_URL (nếu có),
 * hoặc empty commit + push (trừ khi TECSOPS_NO_EMPTY_REDEPLOY=1).
 * Dữ liệu production phụ thuộc Redis trên Railway (REDIS_URL cố định) — script nhắc backup khi có REDIS_URL.
 */
import { execSync, spawnSync } from "node:child_process";
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

/** `git push` và trả về stdout+stderr (để phát hiện Everything up-to-date). */
function gitPushCapture() {
  const r = spawnSync("git", ["push", "-u", "origin", "HEAD"], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const combined = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  return combined;
}

/**
 * Khi remote đã có đủ commit, GitHub không gửi hook → Railway không build lại.
 * Gọi Deploy Hook (Railway) hoặc tạo empty commit để luôn có sự kiện deploy.
 */
async function redeployIfUpToDate(pushOutput) {
  if (!/Everything up-to-date/i.test(pushOutput)) return;
  if (process.env.TECSOPS_NO_EMPTY_REDEPLOY === "1") {
    console.info(
      "[deploy:ship] Push không đổi remote — bỏ qua redeploy (TECSOPS_NO_EMPTY_REDEPLOY=1). " +
        "Railway có thể không build lại.\n"
    );
    return;
  }

  const hook = process.env.RAILWAY_DEPLOY_HOOK_URL?.trim();
  if (hook) {
    console.info("[deploy:ship] Remote không đổi — gọi RAILWAY_DEPLOY_HOOK_URL để Railway build lại…\n");
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (res.ok) {
        console.info(`[deploy:ship] Deploy hook OK (HTTP ${res.status}).`);
        return;
      }
      console.error(`[deploy:ship] Deploy hook lỗi HTTP ${res.status}: ${text.slice(0, 400)}`);
    } catch (e) {
      console.error("[deploy:ship] Deploy hook không gọi được:", e?.message ?? e);
    }
    console.info("[deploy:ship] Fallback: empty commit + push…\n");
  } else {
    console.info(
      "[deploy:ship] Remote không đổi — tạo empty commit + push để kích hoạt GitHub → Railway " +
        "(hoặc đặt RAILWAY_DEPLOY_HOOK_URL trong .env để dùng hook thay vì commit rỗng).\n"
    );
  }

  sh('git commit --allow-empty -m "chore: trigger Railway deploy"');
  gitPushCapture();
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
if (branch !== "main" && branch !== "master") {
  console.warn(
    `\n[deploy:ship] ⚠ Nhánh hiện tại là «${branch}», không phải main.\n` +
      "  Railway/GitHub thường **chỉ build nhánh production (main)** — push lên nhánh này có thể **không** cập nhật app production.\n" +
      "  Cách xử lý: merge vào main rồi `git push origin main`, hoặc trong Railway đổi «Watch branch» sang nhánh bạn đang dùng.\n"
  );
}
console.info(`\n[deploy:ship] ▶ git push -u origin HEAD (nhánh hiện tại: ${branch})\n`);
const pushOut = gitPushCapture();
await redeployIfUpToDate(pushOut);

const verify = process.env.TECSOPS_VERIFY_URL?.trim().replace(/\/$/, "");
const verifyWaitMs = Number(process.env.TECSOPS_VERIFY_WAIT_MS ?? 900_000);
const verifyIntervalMs = Number(process.env.TECSOPS_VERIFY_INTERVAL_MS ?? 10_000);

if (verify) {
  const healthUrl = `${verify}/api/health`;
  const maxAttempts = Math.max(1, Math.ceil(verifyWaitMs / verifyIntervalMs));
  console.info(
    `\n[deploy:ship] ▶ Chờ production sống: GET ${healthUrl} (tối đa ~${Math.round(verifyWaitMs / 60_000)} phút, mỗi ${verifyIntervalMs / 1000}s)\n`
  );
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      if (res.ok) {
        console.info(`[deploy:ship] Health OK (lần ${attempt}/${maxAttempts}, HTTP ${res.status}): ${text.slice(0, 160)}`);
        lastErr = "";
        break;
      }
      lastErr = `HTTP ${res.status} — ${text.slice(0, 200)}`;
      console.warn(`[deploy:ship] Chưa OK (${lastErr}). Thử lại sau ${verifyIntervalMs / 1000}s…`);
    } catch (e) {
      lastErr = String(e?.message ?? e);
      console.warn(`[deploy:ship] Gọi health lỗi (${lastErr}). Thử lại sau ${verifyIntervalMs / 1000}s…`);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, verifyIntervalMs));
    }
  }
  if (lastErr && lastErr !== "") {
    console.error(`[deploy:ship] Hết thời gian chờ — health vẫn không OK. Lỗi cuối: ${lastErr}`);
    process.exit(1);
  }
} else {
  console.info(
    "\n[deploy:ship] Gợi ý: set TECSOPS_VERIFY_URL trong .env (URL production, không dấu / cuối) để script **chờ** /api/health = 200 sau khi Railway build xong.\n" +
      "  Tuỳ chọn: TECSOPS_VERIFY_WAIT_MS (mặc định 900000), TECSOPS_VERIFY_INTERVAL_MS (mặc định 10000).\n"
  );
}

console.info("\n[deploy:ship] Hoàn tất. Railway (nếu nối GitHub) sẽ build/deploy từ commit vừa push.\n");
