/**
 * Thin select `synced_at` từ namnamlogistics (`lots`, `ops_customers`).
 * Không migration. Overlay chỉ trên response — không ghi lại Railway state.
 */

import { getDbPool } from "./dbPool.mjs";
import {
  buildLotsSyncByWarehouse,
  maxCustomerSyncedAtMs,
  maxSyncedAtMs,
  mergeCustomerSyncedAt,
  mergeLotSyncedAt,
  toSyncedAtIso,
} from "../shared/dbSyncedAt.mjs";

const CACHE_MS = 45_000;

/** @type {{ at: number, snapshot: object } | null} */
let cache = null;

export function namnamlogisticsRestConfig() {
  const url = (
    process.env.NAMNAMLOGISTICS_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim().replace(/\/$/, "");
  const key = (
    process.env.NAMNAMLOGISTICS_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

export function resetNamnamlogisticsSyncedAtCache() {
  cache = null;
}

async function fetchRestTable(cfg, table, select) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`namnamlogistics ${table} HTTP ${res.status}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

async function loadFromRest() {
  const cfg = namnamlogisticsRestConfig();
  if (!cfg) return null;
  const [lots, customers] = await Promise.all([
    fetchRestTable(cfg, "lots", "awb,awb_norm,warehouse,session_date,synced_at"),
    fetchRestTable(cfg, "ops_customers", "code,synced_at"),
  ]);
  return { lots, customers, source: "namnamlogistics-rest" };
}

async function tableExists(pool, name) {
  const res = await pool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
    `,
    [name]
  );
  return res.rows.length > 0;
}

async function loadFromPostgres() {
  const pool = getDbPool();
  if (!pool) return null;
  const [hasLots, hasCustomers] = await Promise.all([
    tableExists(pool, "lots"),
    tableExists(pool, "ops_customers"),
  ]);
  if (!hasLots && !hasCustomers) return null;
  const lots = hasLots
    ? (
        await pool.query(
          `SELECT awb, awb_norm, warehouse, session_date, synced_at FROM lots`
        )
      ).rows
    : [];
  const customers = hasCustomers
    ? (await pool.query(`SELECT code, synced_at FROM ops_customers`)).rows
    : [];
  return { lots, customers, source: "postgres-lots" };
}

export async function loadNamnamlogisticsSyncedAtSnapshot({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) return cache.snapshot;
  let snapshot = null;
  try {
    snapshot = await loadFromRest();
  } catch (e) {
    console.warn("[synced_at] REST namnamlogistics:", e?.message ?? e);
  }
  if (!snapshot) {
    try {
      snapshot = await loadFromPostgres();
    } catch (e) {
      console.warn("[synced_at] Postgres lots/ops_customers:", e?.message ?? e);
    }
  }
  if (!snapshot) {
    snapshot = { lots: [], customers: [], source: null };
  }
  cache = { at: now, snapshot };
  return snapshot;
}

export function buildSyncMeta(snapshot) {
  const lots = snapshot?.lots ?? [];
  const customers = snapshot?.customers ?? [];
  const lotsMaxMs = maxSyncedAtMs(lots.map((l) => l?.synced_at ?? l?.syncedAt));
  const customersMaxMs = maxCustomerSyncedAtMs(customers);
  return {
    source: snapshot?.source ?? null,
    lotsMaxSyncedAt: lotsMaxMs == null ? null : new Date(lotsMaxMs).toISOString(),
    lotsMaxSyncedAtByWarehouse: buildLotsSyncByWarehouse(lots),
    customersMaxSyncedAt: customersMaxMs == null ? null : new Date(customersMaxMs).toISOString(),
  };
}

/**
 * Gắn syncedAt lên rows (lots) và customers (ops_customers) — hai nguồn tách biệt.
 */
export function overlaySyncedAtOnState(state, snapshot) {
  if (!state || typeof state !== "object") return state;
  const lots = snapshot?.lots ?? [];
  const opsCustomers = snapshot?.customers ?? [];
  return {
    ...state,
    rows: mergeLotSyncedAt(state.rows ?? [], lots),
    customers: mergeCustomerSyncedAt(state.customers ?? [], opsCustomers),
    syncMeta: buildSyncMeta(snapshot),
  };
}

export async function attachDbSyncedAt(state) {
  if (!state || typeof state !== "object") return state;
  try {
    const snapshot = await loadNamnamlogisticsSyncedAtSnapshot();
    if (!snapshot?.source) {
      const fromState = overlaySyncedAtOnState(state, { lots: [], customers: [], source: "state-rows" });
      const hasLot = (fromState.rows ?? []).some((r) => toSyncedAtIso(r?.syncedAt ?? r?.synced_at));
      const hasCus = (fromState.customers ?? []).some((c) =>
        toSyncedAtIso(c?.syncedAt ?? c?.synced_at)
      );
      if (!hasLot && !hasCus) {
        return {
          ...state,
          syncMeta: {
            source: null,
            lotsMaxSyncedAt: null,
            lotsMaxSyncedAtByWarehouse: {},
            customersMaxSyncedAt: null,
          },
        };
      }
      return fromState;
    }
    return overlaySyncedAtOnState(state, snapshot);
  } catch (e) {
    console.warn("[synced_at] overlay:", e?.message ?? e);
    return state;
  }
}
