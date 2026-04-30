import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

export const DEFAULT_STATE_KEY = "tecsops:state";
export const TABLE_NAME = "app_state";

export function postgresStateKey() {
  return process.env.POSTGRES_STATE_KEY || process.env.REDIS_STATE_KEY || DEFAULT_STATE_KEY;
}

export function makePgPool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
    max: 3,
  });
}

export async function ensurePostgresStateSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id text PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
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
  const pool = makePgPool(databaseUrl);
  const key = postgresStateKey();
  try {
    const client = await pool.connect();
    try {
      await ensurePostgresStateSchema(client);
      await client.query(
        `
        INSERT INTO ${TABLE_NAME} (id, state, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = now()
        `,
        [key, stateString]
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  return key;
}

export async function readStateStringFromPostgres(databaseUrl) {
  const pool = makePgPool(databaseUrl);
  const key = postgresStateKey();
  try {
    const client = await pool.connect();
    try {
      await ensurePostgresStateSchema(client);
      const res = await client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1`, [key]);
      const state = res.rows[0]?.state ?? null;
      return { key, stateString: state ? JSON.stringify(state) : null };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
