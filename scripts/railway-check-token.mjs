/**
 * Kiểm tra RAILWAY_TOKEN trong .env.local trước khi deploy.
 * Usage: npm run railway:check
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join } from "node:path";
import { applyRailwayProjectTokenEnv, projectRoot } from "./loadProjectEnv.mjs";

const GRAPHQL = "https://backboard.railway.com/graphql/v2";
const TECSOPS_PROJECT = "chic-nurturing";

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
}

function info(msg) {
  console.log(`   ${msg}`);
}

async function gql(token, query) {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, raw: text.slice(0, 200) };
  }
}

function runRailway(args) {
  return spawnSync("railway", args, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
}

function printHowToPaste() {
  console.log(`
══════════════════════════════════════════════════════════════
  CÁCH DÁN TOKEN ĐÚNG (TECSOPS → project ${TECSOPS_PROJECT})
══════════════════════════════════════════════════════════════

1) Mở Railway Dashboard → chọn project **${TECSOPS_PROJECT}**
2) **Project Settings** (⚙️ project, KHÔNG phải Account Settings)
3) Tab **Tokens** → **Create Token** → chọn environment (production)
4) Copy token NGAY (Railway chỉ hiện một lần)

5) Mở file (trong repo này):

   ${join(projectRoot, ".env.local")}

   Dán ĐÚNG một dòng (KHÔNG dấu ngoặc, KHÔNG space):

   RAILWAY_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

6) Kiểm tra lại:
   npm run railway:check

7) Deploy:
   npm run railway:up

❌ KHÔNG dùng token từ Account Settings → Tokens (đó là account/workspace token)
❌ KHÔNG chạy railway whoami để test project token — lệnh đó cần railway login
❌ KHÔNG set cả RAILWAY_TOKEN và RAILWAY_API_TOKEN cùng lúc

Nếu vẫn lỗi OAuth (invalid_grant):
   railway logout
   npm run railway:check
══════════════════════════════════════════════════════════════
`);
}

const envLocalPath = join(projectRoot, ".env.local");
console.log(`\n[railway:check] Kiểm tra token tại ${envLocalPath}\n`);

if (!fs.existsSync(envLocalPath)) {
  fail("Chưa có .env.local — tạo file và thêm RAILWAY_TOKEN=...");
  printHowToPaste();
  process.exit(1);
}

const token = applyRailwayProjectTokenEnv();
if (!token) {
  fail("Thiếu RAILWAY_TOKEN trong .env.local");
  printHowToPaste();
  process.exit(1);
}

console.log(`Token: đã đọc (${token.length} ký tự)`);
if (!/^[0-9a-f-]{36}$/i.test(token)) {
  warn("Định dạng không giống UUID Railway — có thể copy thiếu/kèm ký tự lạ");
}

const meRes = await gql(token, "{ me { email name } }");
const meOk = Boolean(meRes.json?.data?.me?.email || meRes.json?.data?.me?.name);

const projectsRes = await gql(
  token,
  "{ projects { edges { node { id name } } } }",
);
const projectErrors = projectsRes.json?.errors?.map((e) => e.message) ?? [];
const projectNames =
  projectsRes.json?.data?.projects?.edges?.map((e) => e.node.name) ?? [];
const hasTecsops = projectNames.includes(TECSOPS_PROJECT);

if (projectErrors.length && !projectNames.length) {
  warn(`GraphQL projects: ${projectErrors.join("; ")}`);
  info("Token có thể đã revoke hoặc không phải token Railway.");
}

if (meOk) {
  warn(
    "Đây là ACCOUNT token (Account Settings), không phải Project token.",
  );
  info(`Email: ${meRes.json.data.me.email ?? meRes.json.data.me.name}`);
  info(
    "TECSOPS deploy cần Project token → Project Settings → Tokens.",
  );
  fail("Sai loại token cho RAILWAY_TOKEN trong .env.local");
  printHowToPaste();
  process.exit(1);
}

if (projectNames.length > 1) {
  warn(
    `Token liệt kê ${projectNames.length} project (${projectNames.slice(0, 3).join(", ")}…) — có thể là workspace token.`,
  );
  info(
    "CLI deploy thường cần **Project token** tạo trong project chic-nurturing.",
  );
}

if (projectNames.length && !hasTecsops) {
  warn(`Không thấy project ${TECSOPS_PROJECT} trong danh sách token.`);
}

// Project token: me thất bại, CLI deploy mới là thước đo cuối
const cliVersion = runRailway(["--version"]);
if ((cliVersion.status ?? 1) === 0) {
  ok(`Railway CLI ${(cliVersion.stdout || cliVersion.stderr || "").trim()}`);
} else {
  warn("Không gọi được railway --version — cài: npm install -g @railway/cli");
}

console.log("\n--- Thử lệnh CLI (project token) ---");
const status = runRailway(["status"]);
const statusOut = `${status.stdout || ""}${status.stderr || ""}`.trim();
if ((status.status ?? 1) === 0) {
  ok("railway status — token project hợp lệ cho CLI");
  console.log(statusOut);
} else if (/Invalid RAILWAY_TOKEN|Unauthorized/i.test(statusOut)) {
  fail("CLI từ chối token — chưa đúng Project token hoặc token hết hạn");
  info(statusOut.split("\n")[0]);
  printHowToPaste();
  process.exit(1);
} else {
  warn("railway status không rõ — xem output:");
  console.log(statusOut || `(exit ${status.status})`);
}

console.log("\n--- Lưu ý ---");
warn("`railway whoami` thường FAIL với project token — đó là bình thường.");
info("Dùng `npm run railway:check` và `npm run railway:up` thay vì whoami.");

if ((status.status ?? 1) === 0) {
  ok("Sẵn sàng deploy: npm run railway:up");
}
