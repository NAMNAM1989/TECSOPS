/**
 * Nhật ký thao tác Ops cho Gemini báo cáo nâng cấp.
 * Table: ops_ai_events — ring buffer ~5000 rows.
 */

import { getDbPool } from "../dbPool.mjs";

const TABLE = "ops_ai_events";
const MAX_EVENTS = 5000;
const META_MAX_KEYS = 24;
const META_STR_MAX = 120;

const SENSITIVE_KEY_RE =
  /password|passwd|secret|token|otp|cccd|passport|idnumber|driverid|agentpicid|apikey|authorization/i;

let schemaReady = false;

export async function ensureOpsAiEventsSchema(pool = getDbPool()) {
  if (!pool) return false;
  if (schemaReady) return true;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      action text NOT NULL,
      source text NOT NULL DEFAULT 'app',
      meta jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ops_ai_events_created_at_idx
      ON ${TABLE} (created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ops_ai_events_action_idx
      ON ${TABLE} (action)
  `);
  schemaReady = true;
  return true;
}

/** Sanitize meta — bỏ key nhạy cảm, cắt chuỗi, giới hạn số key. */
export function sanitizeEventMeta(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= META_MAX_KEYS) break;
    const key = String(k).slice(0, 64);
    if (!key || SENSITIVE_KEY_RE.test(key)) continue;
    if (v == null) {
      out[key] = null;
      n += 1;
      continue;
    }
    if (typeof v === "boolean" || typeof v === "number") {
      if (typeof v === "number" && !Number.isFinite(v)) continue;
      out[key] = v;
      n += 1;
      continue;
    }
    if (typeof v === "string") {
      out[key] = v.slice(0, META_STR_MAX);
      n += 1;
      continue;
    }
    if (Array.isArray(v)) {
      out[key] = v
        .slice(0, 12)
        .map((x) =>
          typeof x === "string"
            ? x.slice(0, 48)
            : typeof x === "number" || typeof x === "boolean"
              ? x
              : String(x).slice(0, 48)
        );
      n += 1;
      continue;
    }
    // object lồng — chỉ lấy keys nông an toàn
    if (typeof v === "object") {
      const nested = {};
      for (const [nk, nv] of Object.entries(v)) {
        if (Object.keys(nested).length >= 8) break;
        if (SENSITIVE_KEY_RE.test(nk)) continue;
        if (typeof nv === "string") nested[nk] = nv.slice(0, 48);
        else if (typeof nv === "number" || typeof nv === "boolean") nested[nk] = nv;
      }
      out[key] = nested;
      n += 1;
    }
  }
  return out;
}

export function normalizeEventAction(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

/**
 * @param {{ action: string, source?: string, meta?: unknown }} evt
 */
export async function recordOpsAiEvent(evt) {
  const pool = getDbPool();
  if (!pool) return { ok: false, reason: "no_db" };
  const action = normalizeEventAction(evt.action);
  if (!action) return { ok: false, reason: "bad_action" };
  const source = String(evt.source || "app")
    .trim()
    .slice(0, 40) || "app";
  const meta = sanitizeEventMeta(evt.meta);
  try {
    await ensureOpsAiEventsSchema(pool);
    await pool.query(
      `INSERT INTO ${TABLE} (action, source, meta) VALUES ($1, $2, $3::jsonb)`,
      [action, source, JSON.stringify(meta)]
    );
    // Ring buffer — xóa dư ngoài MAX_EVENTS
    await pool.query(
      `
      DELETE FROM ${TABLE}
      WHERE id < (
        SELECT id FROM ${TABLE}
        ORDER BY id DESC
        OFFSET $1
        LIMIT 1
      )
      `,
      [MAX_EVENTS]
    );
    return { ok: true };
  } catch (e) {
    console.warn("[ai/events] record failed:", e?.message || e);
    return { ok: false, reason: "db_error" };
  }
}

/** Ghi mutation.* — không throw. */
export function recordMutationEventSafe(mutation) {
  if (!mutation || typeof mutation !== "object") return;
  const action = String(mutation.action || "UNKNOWN").trim() || "UNKNOWN";
  const meta = { action };
  if (mutation.id) meta.shipmentId = String(mutation.id).slice(0, 40);
  if (Array.isArray(mutation.ids)) meta.idCount = mutation.ids.length;
  if (mutation.shipment?.warehouse) meta.warehouse = String(mutation.shipment.warehouse);
  if (mutation.shipment?.sessionDate) meta.sessionDate = String(mutation.shipment.sessionDate);
  if (mutation.patch && typeof mutation.patch === "object") {
    meta.fields = Object.keys(mutation.patch).slice(0, 20);
  }
  if (action === "SET_CUSTOMERS" && Array.isArray(mutation.customers)) {
    meta.customerCount = mutation.customers.length;
  }
  void recordOpsAiEvent({
    action: `mutation.${action.toLowerCase()}`,
    source: "mutation",
    meta,
  });
}

export async function countEventsSinceDays(days = 7) {
  const pool = getDbPool();
  if (!pool) return 0;
  try {
    await ensureOpsAiEventsSchema(pool);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${TABLE}
       WHERE created_at >= now() - ($1::int * interval '1 day')`,
      [Math.max(1, Math.min(90, Number(days) || 7))]
    );
    return Number(rows[0]?.n) || 0;
  } catch {
    return 0;
  }
}

/**
 * Tổng hợp đếm action / field UPDATE cho prompt Gemini.
 * @returns {Promise<{ days: number, total: number, topActions: {action:string,count:number}[], updateFields: {field:string,count:number}[], recentErrors: {action:string,error:string,count:number}[] }>}
 */
export function aggregateEventsFromRows(rows, days = 7) {
  const actionCounts = new Map();
  const fieldCounts = new Map();
  const errorCounts = new Map();
  for (const row of rows) {
    const action = String(row.action || "");
    actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    if (Array.isArray(meta.fields)) {
      for (const f of meta.fields) {
        const key = String(f);
        if (!key) continue;
        fieldCounts.set(key, (fieldCounts.get(key) || 0) + 1);
      }
    }
    if (meta.error || meta.errorCode) {
      const ek = `${action}|${String(meta.errorCode || meta.error).slice(0, 80)}`;
      errorCounts.set(ek, (errorCounts.get(ek) || 0) + 1);
    }
  }
  const sortMap = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([k, count]) =>
        k.includes("|")
          ? {
              action: k.split("|")[0],
              error: k.split("|").slice(1).join("|"),
              count,
            }
          : { action: k, count }
      );

  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([action, count]) => ({ action, count }));

  const updateFields = [...fieldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([field, count]) => ({ field, count }));

  return {
    days,
    total: rows.length,
    topActions,
    updateFields,
    recentErrors: sortMap(errorCounts).filter((x) => x.error),
  };
}

export async function loadEventsAggregate(days = 7) {
  const pool = getDbPool();
  const d = Math.max(1, Math.min(90, Number(days) || 7));
  if (!pool) {
    return aggregateEventsFromRows([], d);
  }
  await ensureOpsAiEventsSchema(pool);
  const { rows } = await pool.query(
    `SELECT action, source, meta, created_at
     FROM ${TABLE}
     WHERE created_at >= now() - ($1::int * interval '1 day')
     ORDER BY created_at DESC
     LIMIT 4000`,
    [d]
  );
  const normalized = rows.map((r) => ({
    action: r.action,
    source: r.source,
    meta: r.meta,
  }));
  return aggregateEventsFromRows(normalized, d);
}
