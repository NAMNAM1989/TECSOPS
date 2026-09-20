import type {
  CustomerDirectoryEntry,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import type { Shipment, Warehouse } from "../types/shipment";
import { emptyWarehouseRecord, normalizeWarehouse } from "../constants/warehouses";
import { rawAwbDigits } from "./awbFormat";
import { findCustomerEntry } from "./customerBookingResolve";
import { compactSearchAlnum, foldSearchText } from "./searchNormalize";

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
  | "shipper"
  | "cnee"
  | "goods"
  | "customer"
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

type CustomerSearchProfile = {
  vehicles: readonly CustomerSavedVehicle[];
  shipperNames: string[];
  consigneeNames: string[];
  goodsNames: string[];
};

function vehicleTokens(raw: string): string[] {
  const folded = foldSearchText(raw);
  const compact = compactSearchAlnum(raw);
  return [...new Set([folded, compact].filter(Boolean))];
}

/**
 * Cache hồ sơ khách theo identity (danh bạ, lô).
 *
 * `findCustomerEntry` quét tuyến tính danh bạ tới 9 lần — gọi một lần / lô rồi
 * WeakMap. Khóa theo identity nên cache hết hiệu lực khi danh bạ hoặc lô được
 * thay bằng object mới sau mutation.
 */
const profileByDirectory = new WeakMap<object, WeakMap<Shipment, CustomerSearchProfile>>();

function getCustomerSearchProfile(
  shipment: Shipment,
  customers: readonly CustomerDirectoryEntry[]
): CustomerSearchProfile {
  const dirKey = customers as unknown as object;
  let perShipment = profileByDirectory.get(dirKey);
  if (!perShipment) {
    perShipment = new WeakMap();
    profileByDirectory.set(dirKey, perShipment);
  }
  const cached = perShipment.get(shipment);
  if (cached) return cached;

  const entry = findCustomerEntry(shipment, customers);
  const built: CustomerSearchProfile = {
    vehicles: entry?.savedVehicles ?? [],
    shipperNames: (entry?.savedShippers ?? []).flatMap((s) => [s.shipperName, s.label]),
    consigneeNames: (entry?.savedConsignees ?? []).flatMap((s) => [s.consigneeName, s.label]),
    goodsNames: (entry?.savedGoods ?? []).flatMap((s) => [s.goodsDescription, s.label]),
  };
  perShipment.set(shipment, built);
  return built;
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
  const profile = getCustomerSearchProfile(shipment, ctx.customers);
  const parts = [
    shipment.awb,
    rawAwbDigits(shipment.awb),
    compactSearchAlnum(shipment.awb),
    shipment.hawb ?? "",
    compactSearchAlnum(shipment.hawb ?? ""),
    shipment.flight,
    shipment.flightDate,
    flightDateNorm,
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
    shipment.shipperNamePrint ?? "",
    shipment.consigneeNamePrint ?? "",
    shipment.goodsDescriptionPrint ?? "",
    shipment.notifyNamePrint ?? "",
    ...profile.shipperNames,
    ...profile.consigneeNames,
    ...profile.goodsNames,
  ];

  for (const v of profile.vehicles) {
    parts.push(v.licensePlate, v.driverName, v.driverId);
    parts.push(...vehicleTokens(v.licensePlate));
  }

  return parts.map((x) => foldSearchText(String(x ?? ""))).filter(Boolean).join(" ");
}

function queryTokens(raw: string): string[] {
  const q = foldSearchText(raw);
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
  const qFold = foldSearchText(query);
  const qCompact = compactSearchAlnum(query);
  if (qCompact.length >= 3 && haystackVehicles.some((v) => v.includes(qCompact))) return true;
  if (qFold.length >= 3 && haystackVehicles.some((v) => v.includes(qFold))) return true;
  return false;
}

function foldedIncludes(hay: string, query: string): boolean {
  const q = foldSearchText(query);
  if (!q) return false;
  if (hay.includes(q)) return true;
  const compact = compactSearchAlnum(query);
  return compact.length >= 3 && hay.includes(compact);
}

function tokenHitsHay(token: string, hay: string): boolean {
  if (hay.includes(token)) return true;
  const compact = compactSearchAlnum(token);
  return compact.length >= 3 && hay.includes(compact);
}

function resolveMatchKind(
  shipment: Shipment,
  query: string,
  ctx: ShipmentSearchContext
): ShipmentSearchMatchKind {
  const q = query.trim();
  const qFold = foldSearchText(q);
  const flightQ = normalizeFlightDateToken(q);

  if (flightQ && normalizeFlightDateToken(shipment.flightDate || "") === flightQ) {
    return "flightDate";
  }

  if (awbDigitsMatch(shipment, q)) {
    const hawbFold = foldSearchText(shipment.hawb ?? "");
    const hawbDigits = rawAwbDigits(shipment.hawb ?? "");
    if (hawbFold && (hawbFold.includes(qFold) || hawbDigits.includes(rawAwbDigits(q)))) {
      return "hawb";
    }
    return "mawb";
  }

  const profile = getCustomerSearchProfile(shipment, ctx.customers);
  const vehicleHay = profile.vehicles.flatMap((v) => vehicleTokens(v.licensePlate));
  if (vehicleMatch(vehicleHay, q)) return "vehicle";

  const drivers = profile.vehicles
    .flatMap((v) => [v.driverName, v.driverId])
    .map((d) => foldSearchText(d))
    .filter(Boolean);
  if (drivers.some((d) => d.includes(qFold))) return "driver";

  if (profile.shipperNames.some((n) => foldedIncludes(foldSearchText(n), q))) return "shipper";
  if (foldedIncludes(foldSearchText(shipment.shipperNamePrint ?? ""), q)) return "shipper";

  if (profile.consigneeNames.some((n) => foldedIncludes(foldSearchText(n), q))) return "cnee";
  if (foldedIncludes(foldSearchText(shipment.consigneeNamePrint ?? ""), q)) return "cnee";

  if (profile.goodsNames.some((n) => foldedIncludes(foldSearchText(n), q))) return "goods";
  if (foldedIncludes(foldSearchText(shipment.goodsDescriptionPrint ?? ""), q)) return "goods";

  if (
    foldedIncludes(foldSearchText(shipment.customer), q) ||
    foldedIncludes(foldSearchText(shipment.customerCode), q)
  ) {
    return "customer";
  }

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
  const flightTokens = tokens.map((t) => normalizeFlightDateToken(t)).filter(Boolean);
  const otherTokens = tokens.filter((t) => !normalizeFlightDateToken(t));

  if (flightTokens.length) {
    const rowFd = normalizeFlightDateToken(shipment.flightDate || "");
    if (!flightTokens.every((ft) => rowFd === ft)) return false;
    if (!otherTokens.length) return true;
  }

  const hay = buildShipmentSearchHaystack(shipment, ctx);
  if (otherTokens.length && otherTokens.every((t) => tokenHitsHay(t, hay))) return true;
  if (!flightTokens.length && tokens.every((t) => tokenHitsHay(t, hay))) return true;

  if (awbDigitsMatch(shipment, q)) return true;

  const profile = getCustomerSearchProfile(shipment, ctx.customers);
  if (vehicleMatch(profile.vehicles.flatMap((v) => vehicleTokens(v.licensePlate)), q)) return true;

  const qFold = foldSearchText(q);
  return profile.vehicles.some((v) => foldSearchText(v.driverName).includes(qFold));
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

    const profile = getCustomerSearchProfile(shipment, ctx.customers);
    const kind = resolveMatchKind(shipment, q, ctx);
    const awbLabel = shipment.awb.trim() || "—";
    const hawbLabel = shipment.hawb?.trim();
    const vehicleLabel = profile.vehicles[0]?.licensePlate?.trim() ?? "";
    const driverLabel = profile.vehicles[0]?.driverName?.trim() ?? "";
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
    else if (kind === "shipper") {
      bits.push(
        (shipment.shipperNamePrint || profile.shipperNames[0] || "").trim() || shipment.customer
      );
    } else if (kind === "cnee") {
      bits.push((shipment.consigneeNamePrint || profile.consigneeNames[0] || "").trim());
    } else if (kind === "goods") {
      bits.push((shipment.goodsDescriptionPrint || profile.goodsNames[0] || "").trim());
    } else {
      if (flightDate) bits.push(flightDate);
      if (vehicleLabel) bits.push(vehicleLabel);
      if (driverLabel) bits.push(driverLabel);
    }

    hits.push({
      shipment,
      kind,
      label,
      sublabel: bits.filter(Boolean).join(" · ") || shipment.customer.trim() || undefined,
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
    case "shipper":
      return "Shipper";
    case "cnee":
      return "CNEE";
    case "goods":
      return "Tên hàng";
    case "customer":
      return "Khách";
    default:
      return "Khác";
  }
}
