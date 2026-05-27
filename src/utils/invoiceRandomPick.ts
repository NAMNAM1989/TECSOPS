import type { InvoiceCatalogItem } from "../types/invoiceItem";
import { fromCatalogEntry } from "../types/invoiceItem";
import type { InvoiceLineItem } from "../types/invoiceItem";

/** Fisher-Yates — lấy n mặt hàng ngẫu nhiên không trùng. */
export function pickRandomCatalogItems(
  catalog: readonly InvoiceCatalogItem[],
  count: number
): InvoiceCatalogItem[] {
  if (catalog.length === 0 || count <= 0) return [];
  const n = Math.min(Math.floor(count), catalog.length);
  const pool = catalog.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

export function randomInvoiceLinesFromCatalog(
  catalog: readonly InvoiceCatalogItem[],
  count: number
): InvoiceLineItem[] {
  return pickRandomCatalogItems(catalog, count).map((entry) => fromCatalogEntry(entry));
}
