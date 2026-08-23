/**
 * Railway/Docker: chỉ Node Ops (Express + static + /api + socket.io).
 * Không spawn Playwright / Python. eSID / eCargo chạy qua Chrome Ext trên PC.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const check = spawnSync(process.execPath, ["scripts/check-deploy-safe.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if ((check.status ?? 1) !== 0) process.exit(check.status ?? 1);

const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

function shutdown(code) {
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  console.error(`[start] web spawn lỗi: ${err?.message || err}`);
  shutdown(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => shutdown(0));
}
