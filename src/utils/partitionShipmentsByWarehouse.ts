import type { Shipment, Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER, isKnownWarehouse } from "../constants/warehouses";

export type ShipmentsByWarehouse = Readonly<Record<Warehouse, Shipment[]>>;

/**
 * Gom lô theo kho trong **một** lượt duyệt (O(n)).
 * `warehouse` không hợp lệ → hiển thị bucket TECS-TCS (không sửa bản ghi).
 */
export function partitionShipmentsByWarehouse(rows: Shipment[]): ShipmentsByWarehouse {
  const buckets = Object.fromEntries(WAREHOUSE_ORDER.map((w) => [w, [] as Shipment[]])) as Record<
    Warehouse,
    Shipment[]
  >;
  for (const r of rows) {
    const w: Warehouse = isKnownWarehouse(r.warehouse) ? r.warehouse : "TECS-TCS";
    buckets[w].push(r);
  }
  return buckets;
}
