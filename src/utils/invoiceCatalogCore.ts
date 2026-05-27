import type { InvoiceCatalogItem, InvoiceCatalogPayload } from "../types/invoiceItem";

export type InvoiceCatalog = InvoiceCatalogPayload;

const LIMITS = {
  id: 80,
  category: 80,
  description: 500,
  hsCode: 20,
  origin: 8,
  unit: 16,
  itemCount: 500,
} as const;

export function newInvoiceCatalogItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `inv-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyInvoiceCatalogItem(partial?: Partial<InvoiceCatalogItem>): InvoiceCatalogItem {
  return clampInvoiceCatalogItem({
    id: newInvoiceCatalogItemId(),
    category: "",
    description: "",
    hsCode: "",
    origin: "VN",
    sampleQuantity: 1,
    unit: "PCE",
    unitPriceUsd: 0,
    kgPerUnit: 0,
    ...partial,
  });
}

export function clampInvoiceCatalogItem(raw: InvoiceCatalogItem): InvoiceCatalogItem {
  return {
    id: String(raw.id ?? "").trim().slice(0, LIMITS.id) || newInvoiceCatalogItemId(),
    category: String(raw.category ?? "").trim().slice(0, LIMITS.category),
    description: String(raw.description ?? "").trim().slice(0, LIMITS.description),
    hsCode: String(raw.hsCode ?? "").trim().slice(0, LIMITS.hsCode),
    origin: String(raw.origin ?? "VN").trim().slice(0, LIMITS.origin).toUpperCase() || "VN",
    sampleQuantity: Math.max(0, Math.min(99999, Number(raw.sampleQuantity) || 0)),
    unit: String(raw.unit ?? "PCE").trim().slice(0, LIMITS.unit).toUpperCase() || "PCE",
    unitPriceUsd: Math.max(0, Number(raw.unitPriceUsd) || 0),
    kgPerUnit: Math.max(0, Number(raw.kgPerUnit) || 0),
  };
}

export function emptyInvoiceCatalog(): InvoiceCatalog {
  return { version: 1, items: [] };
}

export function clampInvoiceCatalog(raw: unknown): InvoiceCatalog {
  if (!raw || typeof raw !== "object") return emptyInvoiceCatalog();
  const o = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw
    .filter((x): x is InvoiceCatalogItem => Boolean(x) && typeof x === "object")
    .map((x) => clampInvoiceCatalogItem(x as InvoiceCatalogItem))
    .filter((x) => x.description.trim())
    .slice(0, LIMITS.itemCount);
  return {
    version: typeof o.version === "number" && o.version > 0 ? Math.floor(o.version) : 1,
    items,
  };
}

export function resolveInvoiceCatalogItems(
  stateCatalog: InvoiceCatalog | undefined,
  staticItems: readonly InvoiceCatalogItem[]
): InvoiceCatalogItem[] {
  const fromState = clampInvoiceCatalog(stateCatalog);
  if (fromState.items.length > 0) return fromState.items;
  return [...staticItems];
}
