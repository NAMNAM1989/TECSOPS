/**
 * SoT đồng bộ namnamlogistics: `lots.synced_at` / `ops_customers.synced_at`.
 * Parse an toàn — không bao giờ trả epoch 0 / Invalid Date.
 */

import { awbDigitsKey } from "./awbFormat.mjs";

/** IANA — Bug_fix_agent: Asia/Saigon (cùng ICT / Asia/Ho_Chi_Minh). */
export const SYNC_DISPLAY_TIME_ZONE = "Asia/Saigon";

/** Trước 2000-01-01 UTC — loại epoch 0 và timestamp rác. */
const MIN_VALID_SYNC_MS = Date.UTC(2000, 0, 1);

export function parseSyncedAtMs(raw) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) && t >= MIN_VALID_SYNC_MS ? t : null;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw === 0) return null;
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return ms >= MIN_VALID_SYNC_MS ? ms : null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s === "0" || s === "Invalid Date") return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t) || t < MIN_VALID_SYNC_MS) return null;
  return t;
}

/** ISO-8601 hoặc null — không trả chuỗi rỗng / Invalid Date. */
export function toSyncedAtIso(raw) {
  const ms = parseSyncedAtMs(raw);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

export function maxSyncedAtMs(values) {
  let max = null;
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    const ms = parseSyncedAtMs(v);
    if (ms == null) continue;
    if (max == null || ms > max) max = ms;
  }
  return max;
}

function warehouseKey(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}

function sessionKey(raw) {
  return String(raw ?? "").trim();
}

export function lotSyncMatchKey(awb, warehouse, sessionDate) {
  return `${awbDigitsKey(awb)}|${warehouseKey(warehouse)}|${sessionKey(sessionDate)}`;
}

/**
 * max(synced_at) các lô trong một kho (và tùy chọn ngày phiên).
 * Không đụng ops_customers.
 * @param {readonly object[] | null | undefined} lots
 * @param {{ warehouse?: string, sessionDate?: string }} [opts]
 * @returns {number | null}
 */
export function maxLotSyncedAtMs(lots, opts = {}) {
  if (!Array.isArray(lots)) return null;
  const wh = opts.warehouse ? warehouseKey(opts.warehouse) : "";
  const session = opts.sessionDate ? sessionKey(opts.sessionDate) : "";
  const values = [];
  for (const lot of lots) {
    if (!lot || typeof lot !== "object") continue;
    if (wh && warehouseKey(lot.warehouse) !== wh) continue;
    if (session) {
      const lotSession = sessionKey(lot.sessionDate ?? lot.session_date);
      if (lotSession && lotSession !== session) continue;
    }
    values.push(lot.syncedAt ?? lot.synced_at);
  }
  return maxSyncedAtMs(values);
}

/**
 * max(synced_at) danh bạ — không đụng lots.
 * @param {readonly object[] | null | undefined} customers
 * @returns {number | null}
 */
export function maxCustomerSyncedAtMs(customers) {
  if (!Array.isArray(customers)) return null;
  return maxSyncedAtMs(customers.map((c) => (c && typeof c === "object" ? c.syncedAt ?? c.synced_at : null)));
}

export function buildLotsSyncByWarehouse(lots) {
  /** @type {Record<string, string | null>} */
  const byWarehouse = {};
  if (!Array.isArray(lots)) return byWarehouse;
  const buckets = new Map();
  for (const lot of lots) {
    if (!lot || typeof lot !== "object") continue;
    const wh = warehouseKey(lot.warehouse);
    if (!wh) continue;
    if (!buckets.has(wh)) buckets.set(wh, []);
    buckets.get(wh).push(lot.syncedAt ?? lot.synced_at);
  }
  for (const [wh, vals] of buckets) {
    const ms = maxSyncedAtMs(vals);
    byWarehouse[wh] = ms == null ? null : new Date(ms).toISOString();
  }
  return byWarehouse;
}

/**
 * Gắn `syncedAt` lên từng lô TECSOPS từ snapshot `lots` namnamlogistics.
 * Khớp AWB digits + kho + ngày phiên.
 */
export function mergeLotSyncedAt(rows, namnamLots) {
  if (!Array.isArray(rows)) return [];
  const byFull = new Map();
  if (Array.isArray(namnamLots)) {
    for (const lot of namnamLots) {
      if (!lot || typeof lot !== "object") continue;
      const iso = toSyncedAtIso(lot.syncedAt ?? lot.synced_at);
      if (!iso) continue;
      const awb = lot.awb_norm || lot.awb || "";
      const key = lotSyncMatchKey(awb, lot.warehouse, lot.session_date ?? lot.sessionDate);
      const prev = byFull.get(key);
      if (!prev || Date.parse(iso) > Date.parse(prev)) byFull.set(key, iso);
    }
  }
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const fromRow = toSyncedAtIso(row.syncedAt ?? row.synced_at);
    const fromDb = byFull.get(lotSyncMatchKey(row.awb, row.warehouse, row.sessionDate));
    const syncedAt = fromDb ?? fromRow;
    if (syncedAt == null && row.syncedAt == null && row.synced_at == null) return row;
    return { ...row, syncedAt: syncedAt ?? null };
  });
}

/** Gắn `syncedAt` theo `ops_customers.code` (không phân biệt hoa thường). */
export function mergeCustomerSyncedAt(customers, opsCustomers) {
  if (!Array.isArray(customers)) return [];
  const byCode = new Map();
  if (Array.isArray(opsCustomers)) {
    for (const c of opsCustomers) {
      if (!c || typeof c !== "object") continue;
      const code = String(c.code ?? "")
        .trim()
        .toUpperCase();
      if (!code) continue;
      const iso = toSyncedAtIso(c.syncedAt ?? c.synced_at);
      if (!iso) continue;
      const prev = byCode.get(code);
      if (!prev || Date.parse(iso) > Date.parse(prev)) byCode.set(code, iso);
    }
  }
  return customers.map((c) => {
    if (!c || typeof c !== "object") return c;
    const code = String(c.code ?? "")
      .trim()
      .toUpperCase();
    const fromRow = toSyncedAtIso(c.syncedAt ?? c.synced_at);
    const fromDb = code ? byCode.get(code) : null;
    const syncedAt = fromDb ?? fromRow;
    if (syncedAt == null && c.syncedAt == null && c.synced_at == null) return c;
    return { ...c, syncedAt: syncedAt ?? null };
  });
}

/**
 * Ops: chỉ lots. Ưu tiên max trên lô đang xem (kho + ngày phiên),
 * rồi max theo kho từ snapshot namnamlogistics. Không dùng customers.
 * @param {{
 *   lots?: readonly object[],
 *   warehouse?: string,
 *   sessionDate?: string,
 *   warehouseMaxSyncedAt?: unknown,
 * }} [opts]
 * @returns {number | null}
 */
export function resolveOpsLotSyncedAtMs({
  lots = [],
  warehouse,
  sessionDate,
  warehouseMaxSyncedAt,
} = {}) {
  const fromVisible = maxLotSyncedAtMs(lots, { warehouse, sessionDate });
  if (fromVisible != null) return fromVisible;
  return parseSyncedAtMs(warehouseMaxSyncedAt);
}

/**
 * Customers: chỉ ops_customers / directory.syncedAt. Không dùng lots.
 * @param {{ customers?: readonly object[], customersMaxSyncedAt?: unknown }} [opts]
 * @returns {number | null}
 */
export function resolveCustomersSyncedAtMs({ customers = [], customersMaxSyncedAt } = {}) {
  const fromRows = maxCustomerSyncedAtMs(customers);
  if (fromRows != null) return fromRows;
  return parseSyncedAtMs(customersMaxSyncedAt);
}

export function formatSyncClockIct(at) {
  const ms = parseSyncedAtMs(at);
  if (ms == null) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: SYNC_DISPLAY_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

export function formatRelativeSync(at, now = Date.now()) {
  const ms = parseSyncedAtMs(at);
  if (ms == null) return "";
  const nowMs = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const sec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (sec < 15) return "vừa xong";
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
}

/**
 * «đã sync lúc HH:mm:ss» (Asia/Saigon) — rỗng nếu thiếu/null (ẩn timestamp).
 */
export function formatSyncedPhrase(at, now = Date.now()) {
  const clock = formatSyncClockIct(at);
  if (!clock) return "";
  const relative = formatRelativeSync(at, now);
  return relative ? `đã sync lúc ${clock} (${relative})` : `đã sync lúc ${clock}`;
}
