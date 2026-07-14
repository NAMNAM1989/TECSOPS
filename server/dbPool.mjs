import pg from "pg";
import { postgresSslOption } from "./postgresSsl.mjs";

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDbPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: postgresSslOption(databaseUrl),
      max: 8,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function withDbClient(fn) {
  const p = getDbPool();
  if (!p) {
    const err = new Error("DATABASE_URL is not configured");
    err.statusCode = 503;
    throw err;
  }
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closeDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
