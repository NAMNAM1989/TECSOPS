import type { Shipment, Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER, normalizeWarehouse } from "../constants/warehouses";

export type ShipmentsByWarehouse = Readonly<Record<Warehouse, Shipment[]>>;

/**
 * Gom lô theo kho trong **một** lượt duyệt (O(n)).
 * Exact-match 4 kho; legacy KHO-* → hub TECS-*.
 */
export function partitionShipmentsByWarehouse(rows: Shipment[]): ShipmentsByWarehouse {
  const buckets = Object.fromEntries(WAREHOUSE_ORDER.map((w) => [w, [] as Shipment[]])) as Record<
    Warehouse,
    Shipment[]
  >;
  for (const r of rows) {
    const w: Warehouse = normalizeWarehouse(r.warehouse);
    buckets[w].push(r);
  }
  return buckets;
}
