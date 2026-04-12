import type { Shipment, Warehouse } from "../types/shipment";

export type ShipmentsByWarehouse = Readonly<Record<Warehouse, Shipment[]>>;

/**
 * Gom lô theo kho trong **một** lượt duyệt (O(n)).
 * Lô có `warehouse` không phải `TECS-SCSC` được gán vào `TECS-TCS` — khớp cách đánh STT phía server khi dữ liệu lệch.
 */
export function partitionShipmentsByWarehouse(rows: Shipment[]): ShipmentsByWarehouse {
  const tcs: Shipment[] = [];
  const scsc: Shipment[] = [];
  for (const r of rows) {
    if (r.warehouse === "TECS-SCSC") scsc.push(r);
    else tcs.push(r);
  }
  const out: ShipmentsByWarehouse = {
    "TECS-TCS": tcs,
    "TECS-SCSC": scsc,
  };
  return out;
}
