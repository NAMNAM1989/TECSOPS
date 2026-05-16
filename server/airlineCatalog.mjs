import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "./airlineLabelDefaults.mjs";
import { normalizeAirlineLabelOverridesLoose } from "./airlineLabelOverridesNormalize.mjs";

export const AIRLINES_TABLE = "airlines";
export const AIRLINE_AWB_PREFIXES_TABLE = "airline_awb_prefixes";
export const AIRLINE_FLIGHT_PREFIXES_TABLE = "airline_flight_prefixes";
export const AIRLINE_DISPLAY_OVERRIDES_TABLE = "airline_display_overrides";

function slugFromDisplayName(name, used) {
  let base = String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  if (!base) base = "airline";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

export async function ensureAirlineCatalogSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AIRLINES_TABLE} (
      id text PRIMARY KEY,
      display_name text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_airlines_display_name
    ON ${AIRLINES_TABLE} (lower(display_name))
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AIRLINE_AWB_PREFIXES_TABLE} (
      awb_prefix char(3) PRIMARY KEY,
      airline_id text NOT NULL REFERENCES ${AIRLINES_TABLE}(id) ON DELETE CASCADE
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AIRLINE_FLIGHT_PREFIXES_TABLE} (
      flight_prefix text PRIMARY KEY,
      airline_id text NOT NULL REFERENCES ${AIRLINES_TABLE}(id) ON DELETE CASCADE
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AIRLINE_DISPLAY_OVERRIDES_TABLE} (
      rule_type text NOT NULL CHECK (rule_type IN ('awb_prefix', 'flight_prefix')),
      rule_key text NOT NULL,
      display_name text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (rule_type, rule_key)
    )
  `);
}

export async function seedAirlineCatalogIfEmpty(client) {
  const res = await client.query(`SELECT 1 FROM ${AIRLINES_TABLE} LIMIT 1`);
  if (res.rows.length > 0) return { seeded: false };

  const nameToId = new Map();
  const usedIds = new Set();

  function idForName(name) {
    const key = String(name).trim();
    if (!key) return null;
    if (nameToId.has(key)) return nameToId.get(key);
    const id = slugFromDisplayName(key, usedIds);
    nameToId.set(key, id);
    return id;
  }

  for (const name of new Set([
    ...Object.values(DEFAULT_AIRLINE_BY_AWB_PREFIX),
    ...Object.values(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX),
  ])) {
    const id = idForName(name);
    if (!id) continue;
    await client.query(
      `INSERT INTO ${AIRLINES_TABLE} (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [id, name]
    );
  }

  for (const [prefix, name] of Object.entries(DEFAULT_AIRLINE_BY_AWB_PREFIX)) {
    const airlineId = idForName(name);
    if (!airlineId) continue;
    await client.query(
      `
      INSERT INTO ${AIRLINE_AWB_PREFIXES_TABLE} (awb_prefix, airline_id)
      VALUES ($1, $2)
      ON CONFLICT (awb_prefix) DO NOTHING
      `,
      [prefix, airlineId]
    );
  }

  for (const [prefix, name] of Object.entries(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX)) {
    const airlineId = idForName(name);
    if (!airlineId) continue;
    await client.query(
      `
      INSERT INTO ${AIRLINE_FLIGHT_PREFIXES_TABLE} (flight_prefix, airline_id)
      VALUES ($1, $2)
      ON CONFLICT (flight_prefix) DO NOTHING
      `,
      [prefix, airlineId]
    );
  }

  return { seeded: true };
}

export async function loadAirlineDisplayOverrides(client) {
  const res = await client.query(
    `SELECT rule_type, rule_key, display_name FROM ${AIRLINE_DISPLAY_OVERRIDES_TABLE} ORDER BY rule_type, rule_key`
  );
  const byAwbPrefix = {};
  const byFlightPrefix = {};
  for (const row of res.rows) {
    const name = String(row.display_name ?? "").trim();
    if (!name) continue;
    if (row.rule_type === "awb_prefix") {
      byAwbPrefix[String(row.rule_key)] = name;
    } else if (row.rule_type === "flight_prefix") {
      byFlightPrefix[String(row.rule_key)] = name;
    }
  }
  return normalizeAirlineLabelOverridesLoose({ byAwbPrefix, byFlightPrefix });
}

export async function saveAirlineDisplayOverrides(client, overrides) {
  const normalized = normalizeAirlineLabelOverridesLoose(overrides);
  await client.query(`DELETE FROM ${AIRLINE_DISPLAY_OVERRIDES_TABLE}`);
  for (const [k, v] of Object.entries(normalized.byAwbPrefix)) {
    await client.query(
      `
      INSERT INTO ${AIRLINE_DISPLAY_OVERRIDES_TABLE} (rule_type, rule_key, display_name, updated_at)
      VALUES ('awb_prefix', $1, $2, now())
      `,
      [k, v]
    );
  }
  for (const [k, v] of Object.entries(normalized.byFlightPrefix)) {
    await client.query(
      `
      INSERT INTO ${AIRLINE_DISPLAY_OVERRIDES_TABLE} (rule_type, rule_key, display_name, updated_at)
      VALUES ('flight_prefix', $1, $2, now())
      `,
      [k, v]
    );
  }
}

/** Chuyển overrides từ JSON blob cũ sang bảng (một lần khi bảng trống). */
export async function migrateAirlineOverridesFromBlob(client, blobOverrides) {
  const count = await client.query(`SELECT COUNT(*)::int AS n FROM ${AIRLINE_DISPLAY_OVERRIDES_TABLE}`);
  if (Number(count.rows[0]?.n ?? 0) > 0) return false;
  const normalized = normalizeAirlineLabelOverridesLoose(blobOverrides);
  const hasAwb = Object.keys(normalized.byAwbPrefix).length > 0;
  const hasFlight = Object.keys(normalized.byFlightPrefix).length > 0;
  if (!hasAwb && !hasFlight) return false;
  await saveAirlineDisplayOverrides(client, normalized);
  return true;
}
