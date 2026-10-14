/**
 * Push API v1 — tính delta shipments giữa 2 state đã commit và phát sự kiện
 * tới các subscriber (SSE, webhook). Event id = stateVersion (tăng đơn điệu).
 */
import {
  EXPORT_API_VERSION,
  EXPORT_SCHEMA_VERSION,
  normalizeExportWarehouse,
  toExportCustomerDto,
  toExportShipmentDto,
} from "./exportContract.mjs";

export const PUSH_EVENT_SHIPMENTS_CHANGED = "shipments.changed";
const DEFAULT_BUFFER_SIZE = 500;

function rowFingerprint(row) {
  return JSON.stringify(row);
}

function indexById(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const id = String(item?.id ?? "");
    if (id) map.set(id, item);
  }
  return map;
}

function removedRef(row) {
  return {
    id: String(row.id || ""),
    sessionDate: String(row.sessionDate || ""),
    warehouse: normalizeExportWarehouse(row.warehouse, String(row.warehouse || "")),
    awb: String(row.awb || ""),
  };
}

/**
 * So sánh rows/customers giữa prev và next.
 * @returns {{ upsertedRows: any[], removedRows: any[], customersChanged: boolean, customers: any[] }}
 */
export function computeStateDelta(prev, next) {
  const prevRows = indexById(prev?.rows);
  const nextRows = indexById(next?.rows);
  const upsertedRows = [];
  const removedRows = [];

  for (const [id, row] of nextRows) {
    const before = prevRows.get(id);
    if (!before || rowFingerprint(before) !== rowFingerprint(row)) upsertedRows.push(row);
  }
  for (const [id, row] of prevRows) {
    if (!nextRows.has(id)) removedRows.push(row);
  }

  const customersChanged =
    rowFingerprint(prev?.customers ?? []) !== rowFingerprint(next?.customers ?? []);

  return {
    upsertedRows,
    removedRows,
    customersChanged,
    customers: Array.isArray(next?.customers) ? next.customers : [],
  };
}

/**
 * Tạo event (view full — subscriber tự thu gọn về core nếu cần).
 * @returns {null | object} null khi không có gì thay đổi
 */
export function buildShipmentsChangedEvent(prev, next, occurredAt = new Date().toISOString()) {
  const delta = computeStateDelta(prev, next);
  if (!delta.upsertedRows.length && !delta.removedRows.length && !delta.customersChanged) {
    return null;
  }
  const stateVersion = Number(next?.version) || 0;
  const sessionDates = new Set();
  for (const r of delta.upsertedRows) if (r.sessionDate) sessionDates.add(String(r.sessionDate));
  for (const r of delta.removedRows) if (r.sessionDate) sessionDates.add(String(r.sessionDate));

  return {
    type: PUSH_EVENT_SHIPMENTS_CHANGED,
    eventId: String(stateVersion),
    apiVersion: EXPORT_API_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    stateVersion,
    occurredAt,
    sessionDates: [...sessionDates].sort(),
    upserted: delta.upsertedRows.map((row) => toExportShipmentDto(row, "full")),
    removed: delta.removedRows.map(removedRef),
    customersChanged: delta.customersChanged,
    customers: delta.customersChanged ? delta.customers.map(toExportCustomerDto) : undefined,
  };
}

const CORE_SHIPMENT_KEYS = Object.keys(toExportShipmentDto({}, "core"));

function toCoreShipment(dto) {
  const out = {};
  for (const k of CORE_SHIPMENT_KEYS) out[k] = dto[k];
  return out;
}

/**
 * Lọc event theo sessionDate/warehouse và thu gọn view cho từng subscriber.
 * @param {object} event
 * @param {{ sessionDate?: string|null, warehouse?: string|null, view?: 'core'|'full' }} filter
 * @returns {null | object} null khi event không liên quan tới filter
 */
export function projectEventForSubscriber(event, filter = {}) {
  const { sessionDate = null, warehouse = null, view = "core" } = filter;
  const match = (s) =>
    (!sessionDate || s.sessionDate === sessionDate) && (!warehouse || s.warehouse === warehouse);

  const upserted = event.upserted.filter(match);
  const removed = event.removed.filter(match);
  const scoped = Boolean(sessionDate || warehouse);
  if (scoped && !upserted.length && !removed.length && !event.customersChanged) return null;

  return {
    ...event,
    sessionDates: scoped ? [...new Set([...upserted, ...removed].map((s) => s.sessionDate))].sort() : event.sessionDates,
    upserted: view === "full" ? upserted : upserted.map(toCoreShipment),
    removed,
  };
}

/**
 * Event bus trong bộ nhớ + ring buffer để client nối lại không mất sự kiện.
 */
export function createPushEventBus({ bufferSize = DEFAULT_BUFFER_SIZE } = {}) {
  /** @type {object[]} */
  const buffer = [];
  /** @type {Set<(event: object) => void>} */
  const subscribers = new Set();
  /** Buffer có đủ mọi sự kiện với stateVersion > floorVersion. null = chưa biết mốc. */
  let floorVersion = null;

  return {
    /** Gọi lúc khởi động với stateVersion hiện tại trong Postgres. */
    setBaseline(version) {
      const v = Number(version);
      if (Number.isFinite(v) && floorVersion == null) floorVersion = v;
    },
    publish(event) {
      if (!event) return;
      if (floorVersion == null) floorVersion = event.stateVersion - 1;
      buffer.push(event);
      if (buffer.length > bufferSize) {
        const dropped = buffer.splice(0, buffer.length - bufferSize);
        floorVersion = dropped[dropped.length - 1].stateVersion;
      }
      for (const fn of subscribers) {
        try {
          fn(event);
        } catch (err) {
          console.error("[push:subscriber]", err);
        }
      }
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /**
     * Sự kiện có stateVersion > sinceVersion.
     * gap=true khi buffer không còn đủ lịch sử → client phải resync qua Export API.
     */
    replaySince(sinceVersion) {
      const since = Number(sinceVersion);
      if (!Number.isFinite(since)) return { events: [], gap: false };
      const events = buffer.filter((e) => e.stateVersion > since);
      const gap = floorVersion != null && since < floorVersion;
      return { events, gap };
    },
    latestVersion() {
      return buffer.length ? buffer[buffer.length - 1].stateVersion : null;
    },
    subscriberCount() {
      return subscribers.size;
    },
  };
}
