import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment, Warehouse } from "../types/shipment";
import { rawAwbDigits } from "./awbFormat";
import { findCustomerByShipment } from "./customerVehicleCore";

export type ShipmentSearchContext = {
  customers: readonly CustomerDirectoryEntry[];
};

export type ShipmentSearchMatchKind = "mawb" | "hawb" | "vehicle" | "driver" | "other";

export type ShipmentSearchMatch = {
  shipment: Shipment;
  kind: ShipmentSearchMatchKind;
  label: string;
  sublabel?: string;
};

function vehicleTokens(raw: string): string[] {
  const lower = raw.trim().toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, "");
  return [...new Set([lower, compact].filter(Boolean))];
}

function getCustomerVehiclesForShipment(
  shipment: Shipment,
  customers: readonly CustomerDirectoryEntry[]
) {
  const entry = findCustomerByShipment(shipment, customers);
  return entry?.savedVehicles ?? [];
}

/** Haystack đầy đủ cho một lô. */
export function buildShipmentSearchHaystack(shipment: Shipment, ctx: ShipmentSearchContext): string {
  const parts = [
    shipment.awb,
    rawAwbDigits(shipment.awb),
    shipment.hawb ?? "",
    shipment.flight,
    shipment.flightDate,
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

function resolveMatchKind(shipment: Shipment, query: string, ctx: ShipmentSearchContext): ShipmentSearchMatchKind {
  const q = query.trim();
  const qLower = q.toLowerCase();

  if (awbDigitsMatch(shipment, q)) {
    const hawb = (shipment.hawb ?? "").toLowerCase();
    if (hawb && (hawb.includes(qLower) || rawAwbDigits(hawb).includes(rawAwbDigits(q)))) return "hawb";
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
  const hay = buildShipmentSearchHaystack(shipment, ctx);
  if (tokens.every((t) => hay.includes(t))) return true;

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

    let label = awbLabel;
    if (hawbLabel) label += ` / ${hawbLabel}`;

    const bits: string[] = [];
    if (kind === "vehicle" && vehicleLabel) bits.push(vehicleLabel);
    else if (kind === "driver" && driverLabel) bits.push(driverLabel);
    else {
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
      acc[row.warehouse] += 1;
      return acc;
    },
    {
      "TECS-TCS": 0,
      "TECS-SCSC": 0,
    } as Record<Warehouse, number>
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
    default:
      return "Khác";
  }
}
