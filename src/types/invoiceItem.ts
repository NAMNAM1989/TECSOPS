/**
 * Catalog mặt hàng HQ — đồng bộ server (SET_INVOICE_CATALOG) hoặc seed từ data_invoice.json.
 */
export interface InvoiceCatalogItem {
  id: string;
  category: string;
  description: string;
  hsCode: string;
  origin: string;
  /** Số kiện trong sheet mẫu — chỉ dùng làm gợi ý ban đầu khi thêm dòng. */
  sampleQuantity: number;
  unit: string;
  unitPriceUsd: number;
  kgPerUnit: number;
}

export interface InvoiceCatalogPayload {
  version: number;
  items: InvoiceCatalogItem[];
}

/**
 * Một dòng trong bảng hàng của invoice xuất ra cho lô hàng. Lưu trong Shipment
 * (persist qua mutation UPDATE) để mọi thiết bị thấy giống nhau.
 */
export interface InvoiceLineItem {
  /** ID nội bộ của dòng (để React key + edit ổn định). */
  lineId: string;
  /** ID trong catalog, có thể rỗng nếu là dòng tự nhập. */
  catalogId?: string;
  category?: string;
  description: string;
  hsCode: string;
  origin: string;
  quantity: number;
  unit: string;
  unitPriceUsd: number;
  /** Quy cách: kg / 1 đơn vị (theo cột I của catalog). */
  kgPerUnit: number;
}

export function emptyInvoiceLineItem(seed?: Partial<InvoiceLineItem>): InvoiceLineItem {
  return {
    lineId:
      seed?.lineId ??
      `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    catalogId: seed?.catalogId,
    category: seed?.category ?? "",
    description: seed?.description ?? "",
    hsCode: seed?.hsCode ?? "",
    origin: seed?.origin ?? "VN",
    quantity: seed?.quantity ?? 0,
    unit: seed?.unit ?? "PCE",
    unitPriceUsd: seed?.unitPriceUsd ?? 0,
    kgPerUnit: seed?.kgPerUnit ?? 0,
  };
}

export function fromCatalogEntry(entry: InvoiceCatalogItem): InvoiceLineItem {
  return emptyInvoiceLineItem({
    catalogId: entry.id,
    category: entry.category,
    description: entry.description,
    hsCode: entry.hsCode,
    origin: entry.origin || "VN",
    quantity: entry.sampleQuantity,
    unit: entry.unit,
    unitPriceUsd: entry.unitPriceUsd,
    kgPerUnit: entry.kgPerUnit,
  });
}

export function invoiceLineAmountUsd(line: InvoiceLineItem): number {
  return Number((line.quantity * line.unitPriceUsd).toFixed(4));
}

export function invoiceLineGrossWeightKg(line: InvoiceLineItem): number {
  return Number((line.quantity * line.kgPerUnit).toFixed(4));
}

export interface InvoiceTotals {
  totalQuantity: number;
  totalAmountUsd: number;
  totalGrossKg: number;
}

export function totalsForInvoice(items: InvoiceLineItem[]): InvoiceTotals {
  return items.reduce<InvoiceTotals>(
    (acc, line) => {
      acc.totalQuantity += Number(line.quantity) || 0;
      acc.totalAmountUsd += invoiceLineAmountUsd(line);
      acc.totalGrossKg += invoiceLineGrossWeightKg(line);
      return acc;
    },
    { totalQuantity: 0, totalAmountUsd: 0, totalGrossKg: 0 }
  );
}
