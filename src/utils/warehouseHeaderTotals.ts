import type { Shipment } from "../types/shipment";
import { computeShipmentWeightMetrics } from "./opsStatsMetrics";

/** Tổng hiện trên header một kho — cùng công thức kg / DIM / chargeable với Thống kê. */
export type WarehouseHeaderTotals = {
  lots: number;
  pcs: number;
  actualKg: number;
  dimKg: number;
  chargeableKg: number;
};

export function summarizeWarehouseHeader(rows: readonly Shipment[]): WarehouseHeaderTotals {
  const out: WarehouseHeaderTotals = {
    lots: rows.length,
    pcs: 0,
    actualKg: 0,
    dimKg: 0,
    chargeableKg: 0,
  };
  for (const row of rows) {
    if (row.pcs != null && Number.isFinite(row.pcs)) out.pcs += Math.max(0, row.pcs);
    const metrics = computeShipmentWeightMetrics(row);
    out.actualKg += metrics.actualKg;
    out.dimKg += metrics.dimKg;
    out.chargeableKg += metrics.chargeableKg;
  }
  return out;
}
