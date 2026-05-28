import type { InvoiceCatalogItem } from "../types/invoiceItem";
import { fromCatalogEntry } from "../types/invoiceItem";
import type { InvoiceLineItem } from "../types/invoiceItem";

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const pool = arr.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

function catalogCategory(item: InvoiceCatalogItem): string {
  return (item.category || "KHÁC").trim() || "KHÁC";
}

/** Số loại hàng khác nhau trong danh mục. */
export function countUniqueCatalogCategories(catalog: readonly InvoiceCatalogItem[]): number {
  const set = new Set<string>();
  for (const item of catalog) set.add(catalogCategory(item));
  return set.size;
}

/**
 * Chọn ngẫu nhiên tối đa `count` mặt hàng — mỗi loại hàng tối đa 1 dòng (không trùng loại).
 */
export function pickRandomCatalogItems(
  catalog: readonly InvoiceCatalogItem[],
  count: number,
  rng: () => number = Math.random,
): InvoiceCatalogItem[] {
  if (catalog.length === 0 || count <= 0) return [];

  const byCategory = new Map<string, InvoiceCatalogItem[]>();
  for (const item of catalog) {
    const cat = catalogCategory(item);
    const list = byCategory.get(cat) ?? [];
    list.push(item);
    byCategory.set(cat, list);
  }

  const categories = shuffle(Array.from(byCategory.keys()), rng);
  const n = Math.min(Math.floor(count), categories.length);
  const picked: InvoiceCatalogItem[] = [];

  for (let i = 0; i < n; i++) {
    const cat = categories[i]!;
    const pool = byCategory.get(cat)!;
    const j = Math.floor(rng() * pool.length);
    picked.push(pool[j]!);
  }

  return picked;
}

export function randomInvoiceLinesFromCatalog(
  catalog: readonly InvoiceCatalogItem[],
  count: number,
  rng: () => number = Math.random,
): InvoiceLineItem[] {
  return pickRandomCatalogItems(catalog, count, rng).map((entry) => fromCatalogEntry(entry));
}
