#!/usr/bin/env node
/**
 * Xóa dữ liệu thử nghiệm (lô + danh bạ khách), giữ tên hãng / profile máy in.
 *
 *   node scripts/reset-trial-data.mjs
 *   # hoặc qua API đang chạy:
 *   curl -X POST http://127.0.0.1:3001/api/mutation -H "Content-Type: application/json" -d "{\"action\":\"RESET_TRIAL_DATA\"}"
 */
import "../server/loadEnv.mjs";
import { createPostgresStateStore } from "../server/postgresStateStore.mjs";
import { loadState, saveState, setPostgresStateStore, applyMutation } from "../server/stateStore.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[reset-trial-data] Thiếu DATABASE_URL (.env / .env.local).");
  process.exit(1);
}

setPostgresStateStore(createPostgresStateStore(databaseUrl));

try {
  const current = await loadState();
  const next = applyMutation(current, { action: "RESET_TRIAL_DATA" });
  await saveState(next);
  console.info(
    `[reset-trial-data] Đã xóa. version ${current.version} → ${next.version}; rows=0; customers=0 (trước: rows=${current.rows?.length ?? 0}, customers=${current.customers?.length ?? 0})`
  );
  process.exit(0);
} catch (e) {
  console.error("[reset-trial-data]", e?.message ?? e);
  process.exit(1);
}
