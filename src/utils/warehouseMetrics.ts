import type { Shipment, Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER } from "../constants/warehouses";

export type WarehouseMetrics = {
  lots: number;
  pcs: number;
  kg: number;
};

export function computeWarehouseMetrics(
  rows: readonly Shipment[]
): Record<Warehouse, WarehouseMetrics> {
  const out = {
    "TECS-TCS": { lots: 0, pcs: 0, kg: 0 },
    "TECS-SCSC": { lots: 0, pcs: 0, kg: 0 },
  } as Record<Warehouse, WarehouseMetrics>;

  for (const row of rows) {
    const bucket = out[row.warehouse];
    if (!bucket) continue;
    bucket.lots += 1;
    bucket.pcs += row.pcs ?? 0;
    bucket.kg += row.kg ?? 0;
  }
  return out;
}

export function firstWarehouseWithLots(rows: readonly Shipment[]): Warehouse {
  const metrics = computeWarehouseMetrics(rows);
  for (const wh of WAREHOUSE_ORDER) {
    if (metrics[wh].lots > 0) return wh;
  }
  return WAREHOUSE_ORDER[0]!;
}
