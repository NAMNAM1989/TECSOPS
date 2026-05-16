#!/usr/bin/env node
/**
 * Tạo/seed bảng master: airlines, airports, customer_parties schema;
 * migrate airline_label overrides từ JSON blob app_state (nếu có).
 *
 *   DATABASE_URL=... node scripts/postgres-migrate-master-catalog.mjs
 */
import pg from "pg";
import { createPostgresStateStore } from "../server/postgresStateStore.mjs";
import {
  loadAirlineDisplayOverrides,
  migrateAirlineOverridesFromBlob,
} from "../server/airlineCatalog.mjs";

const { Pool } = pg;
const TABLE_NAME = "app_state";
const DEFAULT_KEY = process.env.POSTGRES_STATE_KEY || process.env.REDIS_STATE_KEY || "tecsops:state";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("Thiếu DATABASE_URL.");
    process.exit(1);
  }
  const store = createPostgresStateStore(databaseUrl);
  await store.loadRawState();

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.internal") ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const airlineCount = await client.query(`SELECT COUNT(*)::int AS n FROM airlines`);
    const airportCount = await client.query(`SELECT COUNT(*)::int AS n FROM airports`);
    const res = await client.query(`SELECT state FROM ${TABLE_NAME} WHERE id = $1`, [DEFAULT_KEY]);
    const blob = res.rows[0]?.state;
    const migrated = await migrateAirlineOverridesFromBlob(
      client,
      blob && typeof blob === "object" ? blob.airlineLabelOverrides : undefined
    );
    await client.query("COMMIT");
    const overrides = await loadAirlineDisplayOverrides(client);
    console.log(
      JSON.stringify(
        {
          ok: true,
          airlines: Number(airlineCount.rows[0]?.n ?? 0),
          airports: Number(airportCount.rows[0]?.n ?? 0),
          overridesMigratedFromBlob: migrated,
          overrideCounts: {
            awb: Object.keys(overrides.byAwbPrefix).length,
            flight: Object.keys(overrides.byFlightPrefix).length,
          },
        },
        null,
        2
      )
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    await store.close();
  }
}

main();
