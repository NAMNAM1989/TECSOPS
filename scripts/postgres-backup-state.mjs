#!/usr/bin/env node
/**
 * Sao lưu state TECSOPS từ Railway Postgres JSONB.
 *
 *   DATABASE_URL=... node scripts/postgres-backup-state.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { readStateStringFromPostgres, summarizeState } from "./postgres-state-common.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[postgres-backup-state] DATABASE_URL is not set.");
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR || process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `tecsops-postgres-state-${stamp}.json`);

try {
  const { key, stateString } = await readStateStringFromPostgres(databaseUrl);
  const payload = {
    key,
    exportedAt: new Date().toISOString(),
    exists: stateString != null,
    body: stateString,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  if (stateString) {
    const summary = summarizeState(stateString);
    console.info(
      `[postgres-backup-state] Wrote ${outFile} (rows=${summary.rowsCount}, version=${summary.version}, bytes=${summary.bytes})`
    );
  } else {
    console.info(`[postgres-backup-state] Wrote ${outFile} (state does not exist)`);
  }
} catch (e) {
  console.error("[postgres-backup-state]", e.message);
  process.exit(1);
}
