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

/** Shipper tờ khai H21 SCSC — độc lập hồ sơ khách. */
export type ScscH21StampId = {
  id: string;
  shipperName: string;
  shipperAddress: string;
  shipperPhone: string;
  stampId: string;
  warehouseScope: ScscH21WarehouseScope;
  active?: boolean;
  /**
   * Ảnh con dấu (data URL image/png|jpeg|webp) — hiện cuối invoice.
   * `null`/thiếu = chưa upload.
   */
  sealImageData?: string | null;
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

/** Một tờ khai H21 trên lô (có thể nhiều tờ / INV -1, -2…). */
export type ScscH21InvoiceDeclaration = {
  id: string;
  /** Số thứ tự INV (1-based). */
  seq: number;
  declarationKg: number;
  cargoFamilyMode: "auto" | "frozen" | "fruit" | "food" | "garment" | "general";
  lines: ScscH21InvoiceLine[];
};

export function isScscH21Warehouse(warehouse: unknown): boolean {
  return String(warehouse ?? "").trim().toUpperCase() === SCSC_H21_WAREHOUSE_SCOPE;
}
