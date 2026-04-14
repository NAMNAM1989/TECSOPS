#!/usr/bin/env node
/**
 * Sao lưu state TECSOPS từ Redis (giá trị là chuỗi JSON).
 * Chạy trước khi deploy rủi ro hoặc định kỳ.
 *
 *   REDIS_URL=... node scripts/redis-backup-state.mjs
 *
 * Khôi phục thủ công (Redis CLI / Railway console):
 *   SET tecsops:state '<paste body JSON string từ file backup>'
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "redis";

const url = process.env.REDIS_URL?.trim();
const key = process.env.REDIS_STATE_KEY || "tecsops:state";

if (!url) {
  console.error("[redis-backup-state] REDIS_URL is not set.");
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR || process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `tecsops-state-${stamp}.json`);

const client = createClient({ url });
client.on("error", (err) => console.error("[redis]", err.message));

await client.connect();
try {
  const val = await client.get(key);
  const payload = {
    key,
    exportedAt: new Date().toISOString(),
    exists: val != null,
    /** Chuỗi JSON đúng như Redis SET — có thể SET lại nguyên vẹn */
    body: val ?? null,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.info(`[redis-backup-state] Wrote ${outFile}`);
} finally {
  await client.quit();
}
