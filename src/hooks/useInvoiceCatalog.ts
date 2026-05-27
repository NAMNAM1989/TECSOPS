import { useEffect, useState } from "react";
import type { InvoiceCatalogItem, InvoiceCatalogPayload } from "../types/invoiceItem";

const CATALOG_URL = "/templates/invoice/data_invoice.json";

type CacheState = {
  items: InvoiceCatalogItem[] | null;
  pending: Promise<InvoiceCatalogItem[]> | null;
};

const cache: CacheState = { items: null, pending: null };

async function fetchCatalog(): Promise<InvoiceCatalogItem[]> {
  if (cache.items) return cache.items;
  if (cache.pending) return cache.pending;
  cache.pending = fetch(CATALOG_URL, { cache: "force-cache" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as InvoiceCatalogPayload;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      cache.items = items;
      return items;
    })
    .catch((err) => {
      cache.pending = null;
      throw err;
    });
  return cache.pending;
}

export function useInvoiceCatalog() {
  const [items, setItems] = useState<InvoiceCatalogItem[]>(cache.items ?? []);
  const [loading, setLoading] = useState<boolean>(cache.items === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cache.items) {
      setItems(cache.items);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    fetchCatalog()
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}

/** Sắp xếp/gom nhóm theo category cho picker. */
export function groupCatalog(items: InvoiceCatalogItem[]): Array<{
  category: string;
  items: InvoiceCatalogItem[];
}> {
  const map = new Map<string, InvoiceCatalogItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || "KHÁC";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "vi"))
    .map(([category, list]) => ({ category, items: list }));
}
