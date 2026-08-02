import type {
  CustomerDirectoryEntry,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import type { Shipment, Warehouse } from "../types/shipment";
import { emptyWarehouseRecord, normalizeWarehouse } from "../constants/warehouses";
import { rawAwbDigits } from "./awbFormat";
import { findCustomerEntry } from "./customerBookingResolve";

const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export type ShipmentSearchContext = {
  customers: readonly CustomerDirectoryEntry[];
};

export type ShipmentSearchMatchKind =
  | "mawb"
  | "hawb"
  | "vehicle"
  | "driver"
  | "flightDate"
  | "other";

export type ShipmentSearchMatch = {
  shipment: Shipment;
  kind: ShipmentSearchMatchKind;
  label: string;
  sublabel?: string;
};

export type FlightDateFacet = {
  /** Chuẩn DDMMM, vd. 28JUL */
  date: string;
  count: number;
};

function vehicleTokens(raw: string): string[] {
  const lower = raw.trim().toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, "");
  return [...new Set([lower, compact].filter(Boolean))];
}

/**
 * Cache xe theo identity (danh bạ, lô).
 *
 * `findCustomerEntry` quét tuyến tính danh bạ tới 9 lần, và mỗi lô gọi hàm này
 * 3 lần cho mỗi ký tự gõ tìm kiếm. Khóa theo identity nên cache tự hết hiệu lực
 * khi danh bạ hoặc lô được thay bằng object mới sau mutation.
 */
const vehiclesByDirectory = new WeakMap<object, WeakMap<Shipment, readonly CustomerSavedVehicle[]>>();

function getCustomerVehiclesForShipment(
  shipment: Shipment,
  customers: readonly CustomerDirectoryEntry[]
): readonly CustomerSavedVehicle[] {
  const dirKey = customers as unknown as object;
  let perShipment = vehiclesByDirectory.get(dirKey);
  if (!perShipment) {
    perShipment = new WeakMap();
    vehiclesByDirectory.set(dirKey, perShipment);
  }
  const cached = perShipment.get(shipment);
  if (cached) return cached;

  const resolved = findCustomerEntry(shipment, customers)?.savedVehicles ?? [];
  perShipment.set(shipment, resolved);
  return resolved;
}

/** Chuẩn hoá ngày bay → DDMMM (28JUL). Hỗ trợ 28jul, 28 JUL, 28/07… */
export function normalizeFlightDateToken(raw: string): string {
  const s0 = raw.trim();
  if (!s0) return "";

  const slash = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s0);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const mon = parseInt(slash[2], 10);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      return `${String(day).padStart(2, "0")}${MONTHS3[mon - 1]}`;
    }
  }

  const compact = s0.replace(/\s+/g, "").toUpperCase();
  const m = /^(\d{1,2})([A-Z]{3})(?:\d{2,4})?$/.exec(compact);
  if (!m) return "";
  const day = parseInt(m[1], 10);
  const mon = m[2] as (typeof MONTHS3)[number];
  if (!MONTHS3.includes(mon) || day < 1 || day > 31) return "";
  return `${String(day).padStart(2, "0")}${mon}`;
}

export function isFlightDateQuery(raw: string): boolean {
  return Boolean(normalizeFlightDateToken(raw));
}

function flightDateSortKey(date: string): number {
  const m = /^(\d{2})([A-Z]{3})$/.exec(date);
  if (!m) return 0;
  const mon = MONTHS3.indexOf(m[2] as (typeof MONTHS3)[number]);
  return (mon >= 0 ? mon : 0) * 100 + parseInt(m[1], 10);
}

/** Các ngày bay có trong danh sách lô — để hiện chip lọc nhanh. */
export function listFlightDateFacets(rows: readonly Shipment[]): FlightDateFacet[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const date = normalizeFlightDateToken(row.flightDate || "");
    if (!date) continue;
    map.set(date, (map.get(date) || 0) + 1);
  }
  return [...map.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => flightDateSortKey(a.date) - flightDateSortKey(b.date));
}

const haystackByDirectory = new WeakMap<object, WeakMap<Shipment, string>>();

/** Haystack đầy đủ cho một lô — cache theo identity vì mỗi ký tự gõ đều dựng lại cho mọi lô. */
export function buildShipmentSearchHaystack(shipment: Shipment, ctx: ShipmentSearchContext): string {
  const dirKey = ctx.customers as unknown as object;
  let perShipment = haystackByDirectory.get(dirKey);
  if (!perShipment) {
    perShipment = new WeakMap();
    haystackByDirectory.set(dirKey, perShipment);
  }
  const cached = perShipment.get(shipment);
  if (cached !== undefined) return cached;

  const built = computeShipmentSearchHaystack(shipment, ctx);
  perShipment.set(shipment, built);
  return built;
}

function computeShipmentSearchHaystack(shipment: Shipment, ctx: ShipmentSearchContext): string {
  const flightDateNorm = normalizeFlightDateToken(shipment.flightDate || "");
  const parts = [
    shipment.awb,
    rawAwbDigits(shipment.awb),
    shipment.hawb ?? "",
    shipment.flight,
    shipment.flightDate,
    flightDateNorm,
    flightDateNorm.toLowerCase(),
    shipment.customer,
    shipment.customerCode,
    shipment.dest,
    shipment.note,
    shipment.cutoffNote,
    shipment.status,
    shipment.warehouse,
    shipment.cutoff,
    shipment.pcs != null ? String(shipment.pcs) : "",
    shipment.kg != null ? String(shipment.kg) : "",
    shipment.dimWeightKg != null ? String(shipment.dimWeightKg) : "",
  ];

  for (const v of getCustomerVehiclesForShipment(shipment, ctx.customers)) {
    parts.push(v.licensePlate, v.driverName, v.driverId);
    parts.push(...vehicleTokens(v.licensePlate));
  }

  return parts.map((x) => String(x ?? "").toLowerCase()).join(" ");
}

function queryTokens(raw: string): string[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  return q.split(/\s+/).filter(Boolean);
}

function awbDigitsMatch(shipment: Shipment, query: string): boolean {
  const digits = rawAwbDigits(query);
  if (digits.length < 3) return false;
  const awbDigits = rawAwbDigits(shipment.awb);
  const hawbDigits = rawAwbDigits(shipment.hawb ?? "");
  return awbDigits.includes(digits) || hawbDigits.includes(digits);
}

function vehicleMatch(haystackVehicles: string[], query: string): boolean {
  const qRaw = query.trim().toLowerCase();
  const qCompact = qRaw.replace(/[^a-z0-9]/g, "");
  if (qCompact.length >= 3 && haystackVehicles.some((v) => v.includes(qCompact))) return true;
  if (qRaw.length >= 3 && haystackVehicles.some((v) => v.includes(qRaw))) return true;
  return false;
}

function resolveMatchKind(
  shipment: Shipment,
  query: string,
  ctx: ShipmentSearchContext
): ShipmentSearchMatchKind {
  const q = query.trim();
  const qLower = q.toLowerCase();
  const flightQ = normalizeFlightDateToken(q);

  if (flightQ && normalizeFlightDateToken(shipment.flightDate || "") === flightQ) {
    return "flightDate";
  }

  if (awbDigitsMatch(shipment, q)) {
    const hawb = (shipment.hawb ?? "").toLowerCase();
    if (hawb && (hawb.includes(qLower) || rawAwbDigits(hawb).includes(rawAwbDigits(q)))) {
      return "hawb";
    }
    return "mawb";
  }

  const vehicles = getCustomerVehiclesForShipment(shipment, ctx.customers).map((v) => v.licensePlate);
  const vehicleHay = vehicles.flatMap((v) => vehicleTokens(v));
  if (vehicleMatch(vehicleHay, q)) return "vehicle";

  const drivers = getCustomerVehiclesForShipment(shipment, ctx.customers)
    .flatMap((v) => [v.driverName, v.driverId])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (drivers.some((d) => d.includes(qLower))) return "driver";

  return "other";
}

export function shipmentMatchesSearchQuery(
  shipment: Shipment,
  raw: string,
  ctx: ShipmentSearchContext
): boolean {
  const q = raw.trim();
  if (!q) return true;

  const tokens = queryTokens(q);
  const flightTokens = tokens
    .map((t) => normalizeFlightDateToken(t))
    .filter(Boolean);
  const otherTokens = tokens.filter((t) => !normalizeFlightDateToken(t));

  if (flightTokens.length) {
    const rowFd = normalizeFlightDateToken(shipment.flightDate || "");
    if (!flightTokens.every((ft) => rowFd === ft)) return false;
    if (!otherTokens.length) return true;
  }

  const hay = buildShipmentSearchHaystack(shipment, ctx);
  if (otherTokens.length && otherTokens.every((t) => hay.includes(t))) return true;
  if (!flightTokens.length && tokens.every((t) => hay.includes(t))) return true;

  if (awbDigitsMatch(shipment, q)) return true;

  const vehicles = getCustomerVehiclesForShipment(shipment, ctx.customers).map((v) => v.licensePlate);
  if (vehicleMatch(vehicles.flatMap((v) => vehicleTokens(v)), q)) return true;

  const qLower = q.toLowerCase();
  const drivers = getCustomerVehiclesForShipment(shipment, ctx.customers)
    .map((v) => v.driverName)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return drivers.some((d) => d.includes(qLower));
}

export function buildShipmentSearchMatches(
  rows: readonly Shipment[],
  raw: string,
  ctx: ShipmentSearchContext,
  limit = 8
): ShipmentSearchMatch[] {
  const q = raw.trim();
  if (!q) return [];

  const hits: ShipmentSearchMatch[] = [];
  for (const shipment of rows) {
    if (!shipmentMatchesSearchQuery(shipment, q, ctx)) continue;

    const vehicles = getCustomerVehiclesForShipment(shipment, ctx.customers);
    const kind = resolveMatchKind(shipment, q, ctx);
    const awbLabel = shipment.awb.trim() || "—";
    const hawbLabel = shipment.hawb?.trim();
    const vehicleLabel = vehicles[0]?.licensePlate?.trim() ?? "";
    const driverLabel = vehicles[0]?.driverName?.trim() ?? "";
    const flightDate = normalizeFlightDateToken(shipment.flightDate || "") || shipment.flightDate.trim();

    let label = awbLabel;
    if (hawbLabel) label += ` / ${hawbLabel}`;

    const bits: string[] = [];
    if (kind === "flightDate" && flightDate) {
      bits.push(flightDate);
      if ((shipment.flight ?? "").trim()) bits.unshift((shipment.flight ?? "").trim());
      if ((shipment.dest ?? "").trim()) bits.push((shipment.dest ?? "").trim());
    } else if (kind === "vehicle" && vehicleLabel) bits.push(vehicleLabel);
    else if (kind === "driver" && driverLabel) bits.push(driverLabel);
    else {
      if (flightDate) bits.push(flightDate);
      if (vehicleLabel) bits.push(vehicleLabel);
      if (driverLabel) bits.push(driverLabel);
    }

    hits.push({
      shipment,
      kind,
      label,
      sublabel: bits.length ? bits.join(" · ") : shipment.customer.trim() || undefined,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function countShipmentsByWarehouse(rows: readonly Shipment[]): Record<Warehouse, number> {
  return rows.reduce(
    (acc, row) => {
      const wh = normalizeWarehouse(row.warehouse);
      acc[wh] += 1;
      return acc;
    },
    emptyWarehouseRecord(() => 0)
  );
}

export function matchKindLabel(kind: ShipmentSearchMatchKind): string {
  switch (kind) {
    case "mawb":
      return "MAWB";
    case "hawb":
      return "HAWB";
    case "vehicle":
      return "Số xe";
    case "driver":
      return "Tài xế";
    case "flightDate":
      return "Ngày bay";
    default:
      return "Khác";
  }
}
