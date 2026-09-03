/** Catalog mặt hàng H21 — chỉ kho SCSC (không dùng TECS-SCSC / TCS / TECS-TCS). */

export const SCSC_H21_WAREHOUSE_SCOPE = "SCSC" as const;

export type ScscH21WarehouseScope = typeof SCSC_H21_WAREHOUSE_SCOPE;

/** Một mặt hàng trong danh mục H21 SCSC. */
export type ScscH21CatalogItem = {
  id: string;
  /** LOẠI HÀNG */
  category: string;
  /** Tên hàng / mô tả chi tiết */
  description: string;
  hsCode: string;
  origin: string;
  qty1: number;
  uom1: string;
  qty2: number;
  uom2: string;
  unitPrice: number;
  amount: number;
  /** QUY CÁCH — hệ số kg/đơn vị */
  unitFactor: number;
  sortOrder: number;
  warehouseScope: ScscH21WarehouseScope;
  active: boolean;
  updatedAt?: string | null;
};

/** Shipper → Stamp ID (mẫu H21 SCSC). */
export type ScscH21StampId = {
  id: string;
  shipperName: string;
  stampId: string;
  warehouseScope: ScscH21WarehouseScope;
};

/**
 * Dòng hàng gắn trên lô SCSC khi lập invoice.
 * `catalogItemId` liên kết về danh mục (có thể null nếu nhập tay).
 */
export type ScscH21InvoiceLine = {
  id: string;
  catalogItemId?: string | null;
  description: string;
  hsCode: string;
  origin: string;
  quantity: number;
  uom: string;
  weightKg: number;
  unitPrice: number;
  amount: number;
};

export function isScscH21Warehouse(warehouse: unknown): boolean {
  return String(warehouse ?? "").trim().toUpperCase() === SCSC_H21_WAREHOUSE_SCOPE;
}
