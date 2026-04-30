#!/usr/bin/env node
/**
 * Migrate state TECSOPS vào Railway Postgres JSONB.
 *
 * Nguồn dữ liệu:
 *   --from-file <backup.json>  Backup format hoặc state JSON thuần
 *   --from-api <url>           Ví dụ https://.../api/state
 *   REDIS_URL                  Nếu không truyền nguồn, đọc Redis key tecsops:state
 *
 *   DATABASE_URL=... node scripts/postgres-migrate-state.mjs --from-file backup.json
 */
import { createClient } from "redis";
import {
  postgresStateKey,
  readStateStringFromFile,
  summarizeState,
  writeStateStringToPostgres,
} from "./postgres-state-common.mjs";

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const fromFile = argValue("--from-file");
const fromApi = argValue("--from-api");

async function readFromRedis() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) throw new Error("No source provided. Set REDIS_URL or pass --from-file/--from-api.");
  const key = process.env.REDIS_STATE_KEY || "tecsops:state";
  const client = createClient({ url: redisUrl });
  client.on("error", (err) => console.error("[redis]", err.message));
  await client.connect();
  try {
    const val = await client.get(key);
    if (!val) throw new Error(`Redis key ${key} does not exist.`);
    return val;
  } finally {
    await client.quit();
  }
}

async function readSourceStateString() {
  if (fromFile) return readStateStringFromFile(fromFile);
  if (fromApi) {
    const res = await fetch(fromApi, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`API state HTTP ${res.status}`);
    return JSON.stringify(await res.json());
  }
  return readFromRedis();
}

let stateString;
try {
  stateString = await readSourceStateString();
  const summary = summarizeState(stateString);
  console.info(`[postgres-migrate-state] Source rows: ${summary.rowsCount}, version: ${summary.version}`);
  console.info(`[postgres-migrate-state] Source customers: ${summary.customersCount ?? "n/a"}`);
  console.info(`[postgres-migrate-state] Source bytes: ${summary.bytes}`);
} catch (e) {
  console.error("[postgres-migrate-state]", e.message);
  process.exit(1);
}

if (dryRun) {
  console.info("[postgres-migrate-state] --dry-run: không ghi Postgres.");
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[postgres-migrate-state] Set DATABASE_URL (Railway Postgres connection string).");
  process.exit(1);
}

try {
  const key = await writeStateStringToPostgres(databaseUrl, stateString);
  console.info(`[postgres-migrate-state] OK — UPSERT ${key || postgresStateKey()} vào Postgres.`);
} catch (e) {
  console.error("[postgres-migrate-state]", e.message);
  process.exit(1);
}
