import fs from "node:fs";
import path from "node:path";
import "../server/loadEnv.mjs";
import { createPostgresStateStore } from "../server/postgresStateStore.mjs";

export const DEFAULT_STATE_KEY = "tecsops:state";

export function postgresStateKey() {
  return process.env.POSTGRES_STATE_KEY || DEFAULT_STATE_KEY;
}

export function stateStringFromPayload(payload) {
  if (payload && typeof payload.body === "string") return payload.body;
  if (payload && typeof payload.body === "object" && payload.body !== null) {
    return JSON.stringify(payload.body);
  }
  if (payload && Array.isArray(payload.rows) && typeof payload.version === "number") {
    return JSON.stringify(payload);
  }
  throw new Error("File must be {version, rows} or backup format with .body");
}

export function parseStateString(stateString) {
  const parsed = JSON.parse(stateString);
  if (!parsed || !Array.isArray(parsed.rows) || typeof parsed.version !== "number") {
    throw new Error("Parsed state must have .version and .rows[]");
  }
  return parsed;
}

export function summarizeState(stateString) {
  const parsed = parseStateString(stateString);
  return {
    version: parsed.version,
    rowsCount: parsed.rows.length,
    customersCount: Array.isArray(parsed.customers) ? parsed.customers.length : null,
    bytes: Buffer.byteLength(stateString, "utf8"),
  };
}

export function readStateStringFromFile(fileArg) {
  const abs = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  return stateStringFromPayload(JSON.parse(fs.readFileSync(abs, "utf8")));
}

export async function writeStateStringToPostgres(databaseUrl, stateString) {
  const state = parseStateString(stateString);
  const store = createPostgresStateStore(databaseUrl);
  try {
    await store.saveState(state);
    return store.key;
  } finally {
    await store.close();
  }
}

export async function readStateStringFromPostgres(databaseUrl) {
  const store = createPostgresStateStore(databaseUrl);
  try {
    const state = await store.loadRawState();
    return {
      key: store.key,
      stateString: state ? JSON.stringify(state) : null,
    };
  } finally {
    await store.close();
  }
}
