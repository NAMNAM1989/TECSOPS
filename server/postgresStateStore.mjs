import pg from "pg";

const { Pool } = pg;

const DEFAULT_STATE_KEY = "tecsops:state";
const TABLE_NAME = "app_state";

function stateKey() {
  return process.env.POSTGRES_STATE_KEY || process.env.REDIS_STATE_KEY || DEFAULT_STATE_KEY;
}

function makePool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id text PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export function createPostgresStateStore(databaseUrl) {
  const pool = makePool(databaseUrl);
  const key = stateKey();
  let schemaReady = false;

  async function withClient(fn) {
    const client = await pool.connect();
    try {
      if (!schemaReady) {
        await ensureSchema(client);
        schemaReady = true;
      }
      return await fn(client);
    } finally {
      client.release();
    }
  }

  return {
    key,
    async loadRawState() {
      return withClient(async (client) => {
        const res = await client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1`, [key]);
        return res.rows[0]?.state ?? null;
      });
    },
    async saveState(state) {
      await withClient(async (client) => {
        await client.query(
          `
          INSERT INTO ${TABLE_NAME} (id, state, updated_at)
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (id)
          DO UPDATE SET state = EXCLUDED.state, updated_at = now()
          `,
          [key, JSON.stringify(state)]
        );
      });
    },
    async runLocked(fn) {
      return withClient(async (client) => {
        await client.query("BEGIN");
        try {
          // Advisory transaction lock avoids a race when the row has not been inserted yet.
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
          const res = await client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1 FOR UPDATE`, [key]);
          const currentRaw = res.rows[0]?.state ?? null;
          const next = await fn(currentRaw);
          await client.query(
            `
            INSERT INTO ${TABLE_NAME} (id, state, updated_at)
            VALUES ($1, $2::jsonb, now())
            ON CONFLICT (id)
            DO UPDATE SET state = EXCLUDED.state, updated_at = now()
            `,
            [key, JSON.stringify(next)]
          );
          await client.query("COMMIT");
          return next;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        }
      });
    },
    async close() {
      await pool.end();
    },
  };
}
