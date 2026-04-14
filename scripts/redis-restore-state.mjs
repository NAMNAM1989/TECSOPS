#!/usr/bin/env node
/**
 * Khôi phục state TECSOPS vào Redis (ghi đè key hiện tại).
 *
 * Định dạng file hỗ trợ:
 * 1) State thuần: { "version": number, "rows": [...] }  (vd. .test-state/state.json)
 * 2) File từ backup: { "body": "<chuỗi JSON state>" } hoặc body là object
 *
 * Chạy (PowerShell):
 *   $env:REDIS_URL = "redis://..."
 *   node scripts/redis-restore-state.mjs D:\path\to\state.json
 *
 * Dry-run (không ghi Redis):
 *   node scripts/redis-restore-state.mjs --dry-run .\.test-state\state.json
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "redis";

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.REDIS_URL?.trim();
const key = process.env.REDIS_STATE_KEY || "tecsops:state";

const fileArg = args[0];
if (!fileArg) {
  console.error("Usage: node scripts/redis-restore-state.mjs [--dry-run] <path-to-json>");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(abs)) {
  console.error(`[redis-restore-state] File not found: ${abs}`);
  process.exit(1);
}

const rawText = fs.readFileSync(abs, "utf8");
let payload;
try {
  payload = JSON.parse(rawText);
} catch (e) {
  console.error("[redis-restore-state] Invalid JSON:", e.message);
  process.exit(1);
}

/** Chuỗi đặt vào Redis (giống khi app saveState) */
let stateString;
if (payload && typeof payload.body === "string") {
  stateString = payload.body;
} else if (payload && typeof payload.body === "object" && payload.body !== null) {
  stateString = JSON.stringify(payload.body);
} else if (payload && Array.isArray(payload.rows) && typeof payload.version === "number") {
  stateString = JSON.stringify(payload);
} else {
  console.error(
    "[redis-restore-state] File must be {version, rows} or backup format with .body"
  );
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(stateString);
} catch (e) {
  console.error("[redis-restore-state] stateString is not valid JSON:", e.message);
  process.exit(1);
}
if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.version !== "number") {
  console.error("[redis-restore-state] Parsed state must have .version and .rows[]");
  process.exit(1);
}

console.info(`[redis-restore-state] Rows: ${parsed.rows.length}, version: ${parsed.version}`);
console.info(`[redis-restore-state] Bytes: ${Buffer.byteLength(stateString, "utf8")}`);

if (dryRun) {
  console.info("[redis-restore-state] --dry-run: không ghi Redis.");
  process.exit(0);
}

if (!url) {
  console.error("[redis-restore-state] Set REDIS_URL (Railway → Redis → connect string).");
  process.exit(1);
}

const client = createClient({ url });
client.on("error", (err) => console.error("[redis]", err.message));

await client.connect();
try {
  await client.set(key, stateString);
  console.info(`[redis-restore-state] OK — SET ${key} trên Redis. Khởi động lại app nếu cần.`);
} finally {
  await client.quit();
}
