/** Catalog mặt hàng H21 — chỉ kho TCS (không dùng TECS-TCS / SCSC / TECS-SCSC). */

import type {
  ScscH21InvoiceDeclaration,
  ScscH21InvoiceLine,
} from "./scscH21Catalog";

export const TCS_H21_WAREHOUSE_SCOPE = "TCS" as const;

export type TcsH21WarehouseScope = typeof TCS_H21_WAREHOUSE_SCOPE;

/** Một mặt hàng trong danh mục H21 TCS. */
export type TcsH21CatalogItem = {
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
  warehouseScope: TcsH21WarehouseScope;
  active: boolean;
  updatedAt?: string | null;
};

/** Shipper tờ khai H21 TCS — độc lập hồ sơ khách. */
export type TcsH21StampId = {
  id: string;
  shipperName: string;
  shipperAddress: string;
  shipperPhone: string;
  stampId: string;
  warehouseScope: TcsH21WarehouseScope;
  active?: boolean;
  /**
   * Ảnh con dấu (data URL image/png|jpeg|webp) — hiện cuối invoice.
   * `null`/thiếu = chưa upload. List mặc định không trả field này (dùng hasSealImage).
   */
  sealImageData?: string | null;
  /** List nhẹ: có con dấu hay không (không kèm base64). */
  hasSealImage?: boolean;
};

/**
 * Dòng hàng gắn trên lô TCS khi lập invoice — cùng shape shipment với SCSC H21.
 * `catalogItemId` liên kết về danh mục TCS (có thể null nếu nhập tay).
 */
export type TcsH21InvoiceLine = ScscH21InvoiceLine;

/** Một tờ khai H21 trên lô (có thể nhiều tờ / INV -1, -2…). */
export type TcsH21InvoiceDeclaration = ScscH21InvoiceDeclaration;

export function isTcsH21Warehouse(warehouse: unknown): boolean {
  return String(warehouse ?? "").trim().toUpperCase() === TCS_H21_WAREHOUSE_SCOPE;
}
