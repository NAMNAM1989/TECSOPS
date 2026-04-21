import type { Warehouse } from "../types/shipment";

/** Thứ tự cột kho trên bảng desktop & mobile. */
export const WAREHOUSE_ORDER: readonly Warehouse[] = [
  "TECS-TCS",
  "TECS-SCSC",
  "KHO-TCS",
  "KHO-SCSC",
];

/** Nhãn hiển thị (UI / form). Mã lưu DB vẫn là giá trị `Warehouse`. */
export const warehouseLabel: Record<Warehouse, string> = {
  "TECS-TCS": "TECS-TCS",
  "TECS-SCSC": "TECS-SCSC",
  "KHO-TCS": "KHO TCS",
  "KHO-SCSC": "KHO SCSC",
};

export function isKnownWarehouse(w: string): w is Warehouse {
  return (WAREHOUSE_ORDER as readonly string[]).includes(w);
}

/** Kho dùng chung luồng / form DIM kiểu SCSC (TECS-SCSC + KHO SCSC). */
export function isScscWarehouse(w: Warehouse): boolean {
  return w === "TECS-SCSC" || w === "KHO-SCSC";
}

/** Kho dùng chung luồng / mẫu DIM kiểu TCS (TECS-TCS + KHO TCS). */
export function isTcsWarehouse(w: Warehouse): boolean {
  return w === "TECS-TCS" || w === "KHO-TCS";
}
