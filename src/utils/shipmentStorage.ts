import type { DimPieceLine, Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { formatLocalSessionDate, startOfLocalDay } from "./sessionDate";
import { SHIPMENT_STATUS_ORDER, migrateShipmentStatus } from "./shipmentWorkflowStatus";

const ROWS_KEY = "tecsops-shipments-v1";
const WORK_DATE_KEY = "tecsops-work-date-v1";

/** Cho phép đọc bản lưu cũ trước khi migrate status. */
const RAW_STATUS_OK = new Set<string>([
  ...SHIPMENT_STATUS_ORDER,
  "AT_RISK",
  "CUTOFF_PASSED",
  "BUILT_UP",
  "DEPARTED",
  "DELIVERED",
]);

const WAREHOUSES: Warehouse[] = ["TECS-TCS", "TECS-SCSC"];

function isDimPieceLine(o: unknown): o is DimPieceLine {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.lCm === "number" &&
    Number.isFinite(x.lCm) &&
    typeof x.wCm === "number" &&
    Number.isFinite(x.wCm) &&
    typeof x.hCm === "number" &&
    Number.isFinite(x.hCm) &&
    typeof x.pcs === "number" &&
    Number.isFinite(x.pcs) &&
    x.lCm > 0 &&
    x.wCm > 0 &&
    x.hCm > 0 &&
    x.pcs > 0
  );
}

function normalizeDimLines(raw: unknown): DimPieceLine[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: DimPieceLine[] = [];
  for (const item of raw) {
    if (!isDimPieceLine(item)) continue;
    out.push({
      lCm: item.lCm,
      wCm: item.wCm,
      hCm: item.hCm,
      pcs: Math.max(1, Math.floor(item.pcs)),
    });
  }
  return out.length > 0 ? out : null;
}

function isShipmentShape(o: unknown): o is Omit<Shipment, "sessionDate"> & { sessionDate?: string } {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.stt === "number" &&
    Number.isFinite(r.stt) &&
    typeof r.awb === "string" &&
    typeof r.flight === "string" &&
    typeof r.flightDate === "string" &&
    typeof r.cutoff === "string" &&
    typeof r.cutoffNote === "string" &&
    (r.note === undefined || typeof r.note === "string") &&
    typeof r.dest === "string" &&
    typeof r.customer === "string" &&
    typeof r.status === "string" &&
    RAW_STATUS_OK.has(r.status) &&
    WAREHOUSES.includes(r.warehouse as Warehouse) &&
    (r.pcs === null || typeof r.pcs === "number") &&
    (r.kg === null || typeof r.kg === "number") &&
    (r.dimWeightKg === undefined || r.dimWeightKg === null || typeof r.dimWeightKg === "number") &&
    (r.dimLines === undefined || r.dimLines === null || Array.isArray(r.dimLines)) &&
    (r.dimDivisor === undefined || r.dimDivisor === null || r.dimDivisor === 6000 || r.dimDivisor === 5000)
  );
}

function legacySessionFallback(): string {
  try {
    const raw = localStorage.getItem(WORK_DATE_KEY);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return formatLocalSessionDate(startOfLocalDay(d));
    }
  } catch {
    /* ignore */
  }
  return formatLocalSessionDate(startOfLocalDay(new Date()));
}

/** null = chưa từng lưu → dùng dữ liệu mặc định app */
export function loadRows(): Shipment[] | null {
  try {
    const raw = localStorage.getItem(ROWS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const fb = legacySessionFallback();
    const rows: Shipment[] = [];
    for (const item of parsed) {
      if (!isShipmentShape(item)) continue;
      const sd =
        typeof item.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.sessionDate)
          ? item.sessionDate
          : fb;
      const dimDivisor =
        item.dimDivisor === 5000 || item.dimDivisor === 6000 ? item.dimDivisor : null;
      const dimLines = normalizeDimLines(item.dimLines);
      const dimWeightKg =
        item.dimWeightKg === null || typeof item.dimWeightKg === "number" ? item.dimWeightKg : null;
      const base: Shipment = {
        ...(item as Shipment),
        sessionDate: sd,
        note: typeof item.note === "string" ? item.note : "",
        dimWeightKg,
        dimLines,
        dimDivisor,
        status: item.status as ShipmentStatus,
      };
      rows.push({
        ...base,
        status: migrateShipmentStatus(base),
      });
    }
    return rows;
  } catch {
    return null;
  }
}

export function saveRows(rows: Shipment[]): void {
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

export function loadWorkDate(): Date | null {
  try {
    const raw = localStorage.getItem(WORK_DATE_KEY);
    if (raw === null) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function saveWorkDate(d: Date): void {
  try {
    localStorage.setItem(WORK_DATE_KEY, d.toISOString());
  } catch {
    /* ignore */
  }
}
