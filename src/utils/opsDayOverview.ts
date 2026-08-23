import type { Shipment, Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER } from "../constants/warehouses";
import {
  computeWarehouseMetrics,
  type WarehouseMetrics,
} from "./warehouseMetrics";

/** Tổng ngày Ops — Lô / Kiện / Kg từ lô đã lọc (cùng nguồn local state với Stats). */
export type DayPulseTotals = {
  lots: number;
  pcs: number;
  kg: number;
};

export type OpsDayOverview = {
  totals: DayPulseTotals;
  byWarehouse: Record<Warehouse, WarehouseMetrics>;
};

/**
 * DayPulse + 4 kho — một lần duyệt, số chip khớp Tổng ngày.
 * Caller đưa rows đã lọc sessionDate + text/status (như `filteredViewRows` trên Ops).
 * Không gọi API — cùng nguồn local state với trang Thống kê.
 */
export function computeOpsDayOverview(rows: readonly Shipment[]): OpsDayOverview {
  const byWarehouse = computeWarehouseMetrics(rows);
  const totals: DayPulseTotals = { lots: 0, pcs: 0, kg: 0 };
  for (const wh of WAREHOUSE_ORDER) {
    const m = byWarehouse[wh];
    totals.lots += m.lots;
    totals.pcs += m.pcs;
    totals.kg += m.kg;
  }
  return { totals, byWarehouse };
}

/** Cộng Lô · Kiện · Kg từ hàng đã lọc. */
export function computeDayPulseTotals(rows: readonly Shipment[]): DayPulseTotals {
  return computeOpsDayOverview(rows).totals;
}
