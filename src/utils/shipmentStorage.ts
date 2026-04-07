import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";

const ROWS_KEY = "tecsops-shipments-v1";
const WORK_DATE_KEY = "tecsops-work-date-v1";

const STATUSES: ShipmentStatus[] = [
  "PENDING",
  "RECEIVED",
  "AT_RISK",
  "CUTOFF_PASSED",
  "BUILT_UP",
  "DEPARTED",
  "DELIVERED",
];

const WAREHOUSES: Warehouse[] = ["TECS-TCS", "TECS-SCSC"];

function isShipment(o: unknown): o is Shipment {
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
    typeof r.dest === "string" &&
    typeof r.customer === "string" &&
    typeof r.status === "string" &&
    STATUSES.includes(r.status as ShipmentStatus) &&
    WAREHOUSES.includes(r.warehouse as Warehouse) &&
    (r.pcs === null || typeof r.pcs === "number") &&
    (r.kg === null || typeof r.kg === "number")
  );
}

/** null = chưa từng lưu → dùng dữ liệu mặc định app */
export function loadRows(): Shipment[] | null {
  try {
    const raw = localStorage.getItem(ROWS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.filter(isShipment);
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
