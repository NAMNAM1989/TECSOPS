/**
 * Preflight trước khi push/deploy: build + test + deploy:check,
 * và backup Postgres/Redis nếu có biến kết nối (tùy chọn nhưng an toàn hơn).
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function npmRun(script) {
  console.info(`\n[deploy:safe] ▶ npm run ${script}\n`);
  execSync(`npm run ${script}`, {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  });
}

npmRun("build");
npmRun("test");
npmRun("deploy:check");

if (process.env.DATABASE_URL?.trim()) {
  console.info("\n[deploy:safe] ▶ backup Postgres (DATABASE_URL đã set)\n");
  npmRun("backup:postgres-state");
} else if (process.env.REDIS_URL?.trim()) {
  console.info("\n[deploy:safe] ▶ backup Redis (REDIS_URL đã set)\n");
  npmRun("backup:redis-state");
} else {
  console.info(
    "\n[deploy:safe] Bỏ qua backup state — set DATABASE_URL/REDIS_URL rồi chạy lại nếu muốn backup trước khi push.\n"
  );
}

console.info(
  "[deploy:safe] Xong preflight. Tiếp theo: git add/commit → `npm run deploy:ship` (một lệnh) hoặc git push thủ công.\n"
);
