import type { Warehouse } from "../types/shipment";

/** Bộ lọc / layout: một kho cụ thể hoặc hiện tất cả. */
export type WarehouseLayoutFilter = Warehouse | "ALL";

/** Thứ tự cột kho trên bảng desktop & mobile — chỉ TECS. */
export const WAREHOUSE_ORDER: readonly Warehouse[] = ["TECS-TCS", "TECS-SCSC"];

/** Nhãn hiển thị (UI / form). Mã lưu DB vẫn là giá trị `Warehouse`. */
export const warehouseLabel: Record<Warehouse, string> = {
  "TECS-TCS": "TECS-TCS",
  "TECS-SCSC": "TECS-SCSC",
};

/** Map kho cũ (KHO-*) → TECS-* khi load / nhập Sheet. */
export function normalizeWarehouse(raw: unknown, fallback: Warehouse = "TECS-TCS"): Warehouse {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (u === "TECS-SCSC" || u === "KHO-SCSC") return "TECS-SCSC";
  if (u === "TECS-TCS" || u === "KHO-TCS") return "TECS-TCS";
  if (u.includes("SCSC") || u.includes("SCCS")) return "TECS-SCSC";
  if (u.includes("TCS")) return "TECS-TCS";
  return fallback;
}

export function isKnownWarehouse(w: string): w is Warehouse {
  return (WAREHOUSE_ORDER as readonly string[]).includes(w);
}

/** Kho SCSC (phiếu cân / DIM SCSC). */
export function isScscWarehouse(w: Warehouse): boolean {
  return w === "TECS-SCSC";
}

/** Kho TCS (mẫu DIM TCS). */
export function isTcsWarehouse(w: Warehouse): boolean {
  return w === "TECS-TCS";
}

/** Danh sách kho cần render section (desktop/mobile) theo bộ lọc trên trang. */
export function warehouseSectionsForLayout(filter: WarehouseLayoutFilter): readonly Warehouse[] {
  return filter === "ALL" ? WAREHOUSE_ORDER : [filter];
}
