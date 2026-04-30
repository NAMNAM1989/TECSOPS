#!/usr/bin/env node
/**
 * Khôi phục state TECSOPS vào Railway Postgres JSONB.
 *
 *   DATABASE_URL=... node scripts/postgres-restore-state.mjs [--dry-run] <path-to-json>
 */
import {
  readStateStringFromFile,
  summarizeState,
  writeStateStringToPostgres,
} from "./postgres-state-common.mjs";

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const fileArg = args[0];

if (!fileArg) {
  console.error("Usage: node scripts/postgres-restore-state.mjs [--dry-run] <path-to-json>");
  process.exit(1);
}

let stateString;
try {
  stateString = readStateStringFromFile(fileArg);
  const summary = summarizeState(stateString);
  console.info(`[postgres-restore-state] Rows: ${summary.rowsCount}, version: ${summary.version}`);
  console.info(`[postgres-restore-state] Customers: ${summary.customersCount ?? "n/a"}`);
  console.info(`[postgres-restore-state] Bytes: ${summary.bytes}`);
} catch (e) {
  console.error("[postgres-restore-state]", e.message);
  process.exit(1);
}

if (dryRun) {
  console.info("[postgres-restore-state] --dry-run: không ghi Postgres.");
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[postgres-restore-state] Set DATABASE_URL (Railway Postgres connection string).");
  process.exit(1);
}

try {
  const key = await writeStateStringToPostgres(databaseUrl, stateString);
  console.info(`[postgres-restore-state] OK — UPSERT ${key} vào Postgres.`);
} catch (e) {
  console.error("[postgres-restore-state]", e.message);
  process.exit(1);
}
