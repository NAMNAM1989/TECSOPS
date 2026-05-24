import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { EcargoJobRecord } from "../types/ecargoJob";
import type { Shipment, Warehouse } from "../types/shipment";
import { rawAwbDigits } from "./awbFormat";
import type { EcargoKhoScscPersistedMap } from "./ecargoKhoScscCore";
import { normalizeEcargoVehicleInput } from "./ecargoKhoScscCore";
import { findCustomerByShipment, resolveEcargoVehiclePrefill } from "./customerVehicleCore";

export type ShipmentSearchContext = {
  ecargoMap: EcargoKhoScscPersistedMap;
  customers: readonly CustomerDirectoryEntry[];
  getEcargoJob?: (id: string) => EcargoJobRecord | undefined;
};

export type ShipmentSearchMatchKind = "mawb" | "hawb" | "vehicle" | "driver" | "other";

export type ShipmentSearchMatch = {
  shipment: Shipment;
  kind: ShipmentSearchMatchKind;
  label: string;
  sublabel?: string;
};

function vehicleTokens(raw: string): string[] {
  const normalized = normalizeEcargoVehicleInput(raw);
  const lower = raw.trim().toLowerCase();
  return [...new Set([lower, normalized.toLowerCase()].filter(Boolean))];
}

/** Haystack đầy đủ cho một lô — gồm MAWB/HAWB, số xe, tài xế. */
export function buildShipmentSearchHaystack(shipment: Shipment, ctx: ShipmentSearchContext): string {
  const savedVehicle = ctx.ecargoMap[shipment.id]?.vehicleInput ?? "";
  const jobVehicle = ctx.getEcargoJob?.(shipment.id)?.vehicleNo ?? "";
  const prefill = resolveEcargoVehiclePrefill(shipment, ctx.customers, savedVehicle);

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
    savedVehicle,
    ...vehicleTokens(savedVehicle),
    jobVehicle,
    ...vehicleTokens(jobVehicle),
    prefill.vehicleInput,
    ...vehicleTokens(prefill.vehicleInput),
    prefill.driverName,
    prefill.driverId,
  ];

  for (const v of getCustomerVehiclesForShipment(shipment, ctx.customers)) {
    parts.push(v.licensePlate, v.driverName, v.driverId);
    parts.push(...vehicleTokens(v.licensePlate));
  }

  return parts.map((x) => String(x ?? "").toLowerCase()).join(" ");
}

function getCustomerVehiclesForShipment(
  shipment: Shipment,
  customers: readonly CustomerDirectoryEntry[]
) {
  const entry = findCustomerByShipment(shipment, customers);
  return entry?.savedVehicles ?? [];
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
  const qNorm = normalizeEcargoVehicleInput(query).toLowerCase();
  const qRaw = query.trim().toLowerCase();
  if (qNorm.length >= 3 && haystackVehicles.some((v) => v.includes(qNorm))) return true;
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

  const savedVehicle = ctx.ecargoMap[shipment.id]?.vehicleInput ?? "";
  const jobVehicle = ctx.getEcargoJob?.(shipment.id)?.vehicleNo ?? "";
  const prefill = resolveEcargoVehiclePrefill(shipment, ctx.customers, savedVehicle);
  const vehicles = [
    savedVehicle,
    jobVehicle,
    prefill.vehicleInput,
    ...getCustomerVehiclesForShipment(shipment, ctx.customers).map((v) => v.licensePlate),
  ];
  const vehicleHay = vehicles.flatMap((v) => vehicleTokens(v));
  if (vehicleMatch(vehicleHay, q)) return "vehicle";

  const drivers = [
    prefill.driverName,
    prefill.driverId,
    ...getCustomerVehiclesForShipment(shipment, ctx.customers).flatMap((v) => [v.driverName, v.driverId]),
  ]
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

  // Cho phép gõ nhanh MAWB/HAWB dạng số hoặc biển số không cần token hóa.
  if (awbDigitsMatch(shipment, q)) return true;

  const savedVehicle = ctx.ecargoMap[shipment.id]?.vehicleInput ?? "";
  const jobVehicle = ctx.getEcargoJob?.(shipment.id)?.vehicleNo ?? "";
  const prefill = resolveEcargoVehiclePrefill(shipment, ctx.customers, savedVehicle);
  const vehicles = [
    savedVehicle,
    jobVehicle,
    prefill.vehicleInput,
    ...getCustomerVehiclesForShipment(shipment, ctx.customers).map((v) => v.licensePlate),
  ];
  if (vehicleMatch(vehicles.flatMap((v) => vehicleTokens(v)), q)) return true;

  const qLower = q.toLowerCase();
  const drivers = [
    prefill.driverName,
    ...getCustomerVehiclesForShipment(shipment, ctx.customers).map((v) => v.driverName),
  ]
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

    const savedVehicle = ctx.ecargoMap[shipment.id]?.vehicleInput ?? "";
    const prefill = resolveEcargoVehiclePrefill(shipment, ctx.customers, savedVehicle);
    const kind = resolveMatchKind(shipment, q, ctx);
    const awbLabel = shipment.awb.trim() || "—";
    const hawbLabel = shipment.hawb?.trim();
    const vehicleLabel = prefill.vehicleInput.trim() || savedVehicle.trim();
    const driverLabel = prefill.driverName.trim();

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
      "KHO-TCS": 0,
      "KHO-SCSC": 0,
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
