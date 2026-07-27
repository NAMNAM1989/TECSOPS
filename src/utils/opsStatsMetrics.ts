import type { Shipment, Warehouse } from "../types/shipment";
import type { WarehouseLayoutFilter } from "../constants/warehouses";
import { WAREHOUSE_ORDER, warehouseLabel } from "../constants/warehouses";
import { filterShipmentsBySessionYmdRange } from "./filterShipmentsBySessionYmd";
import { resolveShipmentDimWeightKg } from "./volumetricDim";

/** Số liệu cân / DIM / chargeable của một lô (trang Thống kê). */
export type ShipmentWeightMetrics = {
  actualKg: number;
  /** 0 nếu chưa đo DIM */
  dimKg: number;
  chargeableKg: number;
  /** chargeable − actual; 0 khi chưa đo DIM */
  deltaKg: number;
  hasDim: boolean;
};

export type OpsStatsTotals = {
  lots: number;
  pcs: number;
  actualKg: number;
  dimKg: number;
  chargeableKg: number;
  deltaKg: number;
  missingDimLots: number;
};

export type OpsStatsDayRow = OpsStatsTotals & {
  sessionDate: string;
};

export type OpsStatsWarehouseRow = OpsStatsTotals & {
  warehouse: Warehouse;
  label: string;
};

export type OpsStatsDestRow = OpsStatsTotals & {
  dest: string;
};

export type OpsStatsLotRow = ShipmentWeightMetrics & {
  shipment: Shipment;
  pcs: number;
};

export type OpsStatsResult = {
  filtered: Shipment[];
  lots: OpsStatsLotRow[];
  totals: OpsStatsTotals;
  byDay: OpsStatsDayRow[];
  byWarehouse: OpsStatsWarehouseRow[];
  byDest: OpsStatsDestRow[];
};

function emptyTotals(): OpsStatsTotals {
  return {
    lots: 0,
    pcs: 0,
    actualKg: 0,
    dimKg: 0,
    chargeableKg: 0,
    deltaKg: 0,
    missingDimLots: 0,
  };
}

function addToTotals(acc: OpsStatsTotals, row: ShipmentWeightMetrics, pcs: number): void {
  acc.lots += 1;
  acc.pcs += pcs;
  acc.actualKg += row.actualKg;
  acc.dimKg += row.dimKg;
  acc.chargeableKg += row.chargeableKg;
  acc.deltaKg += row.deltaKg;
  if (!row.hasDim) acc.missingDimLots += 1;
}

/** Chuẩn hóa dest để gom nhóm. */
export function normalizeStatsDest(raw: string | null | undefined): string {
  const d = String(raw ?? "")
    .trim()
    .toUpperCase();
  return d || "(chưa có dest)";
}

/**
 * Chargeable / Δ cho một lô.
 * - Chưa đo DIM → chargeable = kg thực, Δ = 0.
 * - Có DIM → chargeable = max(kg, DIM), Δ = chargeable − kg.
 */
export function computeShipmentWeightMetrics(s: Shipment): ShipmentWeightMetrics {
  const safeActual =
    s.kg != null && Number.isFinite(s.kg) ? Math.max(0, s.kg) : 0;

  const dimResolved = resolveShipmentDimWeightKg({
    flight: s.flight,
    awb: s.awb,
    dimWeightKg: s.dimWeightKg,
    dimLines: s.dimLines,
    dimDivisor: s.dimDivisor,
  });

  if (dimResolved == null || !Number.isFinite(dimResolved) || dimResolved < 0) {
    return {
      actualKg: safeActual,
      dimKg: 0,
      chargeableKg: safeActual,
      deltaKg: 0,
      hasDim: false,
    };
  }

  const dimKg = dimResolved;
  const chargeableKg = Math.max(safeActual, dimKg);
  return {
    actualKg: safeActual,
    dimKg,
    chargeableKg,
    deltaKg: chargeableKg - safeActual,
    hasDim: true,
  };
}

function filterByWarehouse(
  rows: readonly Shipment[],
  warehouse: WarehouseLayoutFilter
): Shipment[] {
  if (warehouse === "ALL") return [...rows];
  return rows.filter((r) => r.warehouse === warehouse);
}

function filterByDest(rows: readonly Shipment[], dest: string | "ALL"): Shipment[] {
  if (dest === "ALL") return [...rows];
  const key = normalizeStatsDest(dest);
  return rows.filter((r) => normalizeStatsDest(r.dest) === key);
}

function sortLots(a: OpsStatsLotRow, b: OpsStatsLotRow): number {
  const da = (a.shipment.sessionDate || "").trim();
  const db = (b.shipment.sessionDate || "").trim();
  if (da !== db) return da.localeCompare(db);
  if (a.shipment.stt !== b.shipment.stt) return a.shipment.stt - b.shipment.stt;
  return (a.shipment.awb || "").localeCompare(b.shipment.awb || "");
}

/** Tổng hợp thống kê theo khoảng sessionDate + kho (+ dest tùy chọn). */
export function computeOpsStats(
  rows: readonly Shipment[],
  opts: {
    fromYmd: string;
    toYmd: string;
    warehouse?: WarehouseLayoutFilter;
    /** Lọc dest đã chuẩn hóa, hoặc ALL */
    dest?: string | "ALL";
  }
): OpsStatsResult {
  const warehouse = opts.warehouse ?? "ALL";
  const destFilter = opts.dest ?? "ALL";
  const inRange = filterShipmentsBySessionYmdRange(rows, opts.fromYmd, opts.toYmd);
  const filtered = filterByDest(filterByWarehouse(inRange, warehouse), destFilter);

  const totals = emptyTotals();
  const byDayMap = new Map<string, OpsStatsTotals>();
  const byWhMap = new Map<Warehouse, OpsStatsTotals>();
  const byDestMap = new Map<string, OpsStatsTotals>();
  const lots: OpsStatsLotRow[] = [];

  for (const wh of WAREHOUSE_ORDER) {
    byWhMap.set(wh, emptyTotals());
  }

  for (const s of filtered) {
    const w = computeShipmentWeightMetrics(s);
    const pcs = s.pcs != null && Number.isFinite(s.pcs) ? Math.max(0, s.pcs) : 0;
    addToTotals(totals, w, pcs);
    lots.push({ shipment: s, pcs, ...w });

    const day = (s.sessionDate || "").trim() || "—";
    let dayBucket = byDayMap.get(day);
    if (!dayBucket) {
      dayBucket = emptyTotals();
      byDayMap.set(day, dayBucket);
    }
    addToTotals(dayBucket, w, pcs);

    const whKey = s.warehouse;
    let whBucket = byWhMap.get(whKey);
    if (!whBucket) {
      whBucket = emptyTotals();
      byWhMap.set(whKey, whBucket);
    }
    addToTotals(whBucket, w, pcs);

    const destKey = normalizeStatsDest(s.dest);
    let destBucket = byDestMap.get(destKey);
    if (!destBucket) {
      destBucket = emptyTotals();
      byDestMap.set(destKey, destBucket);
    }
    addToTotals(destBucket, w, pcs);
  }

  const byDay: OpsStatsDayRow[] = [...byDayMap.entries()]
    .map(([sessionDate, t]) => ({ sessionDate, ...t }))
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

  const byWarehouse: OpsStatsWarehouseRow[] = WAREHOUSE_ORDER.map((wh) => ({
    warehouse: wh,
    label: warehouseLabel[wh],
    ...(byWhMap.get(wh) ?? emptyTotals()),
  }));

  const byDest: OpsStatsDestRow[] = [...byDestMap.entries()]
    .map(([dest, t]) => ({ dest, ...t }))
    .sort((a, b) => b.lots - a.lots || a.dest.localeCompare(b.dest));

  lots.sort(sortLots);

  return { filtered, lots, totals, byDay, byWarehouse, byDest };
}

/** Danh sách dest có trong khoảng (trước khi lọc dest) — dùng cho dropdown. */
export function listDestOptionsInRange(
  rows: readonly Shipment[],
  opts: { fromYmd: string; toYmd: string; warehouse?: WarehouseLayoutFilter }
): string[] {
  const warehouse = opts.warehouse ?? "ALL";
  const inRange = filterShipmentsBySessionYmdRange(rows, opts.fromYmd, opts.toYmd);
  const scoped = filterByWarehouse(inRange, warehouse);
  const set = new Set<string>();
  for (const s of scoped) set.add(normalizeStatsDest(s.dest));
  return [...set].sort((a, b) => a.localeCompare(b));
}
