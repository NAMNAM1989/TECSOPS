/** Đồng bộ với `src/utils/invoiceCatalogCore.ts` */

const LIMITS = {
  id: 80,
  category: 80,
  description: 500,
  hsCode: 20,
  origin: 8,
  unit: 16,
  itemCount: 500,
};

function clip(s, max) {
  return String(s ?? "").slice(0, max);
}

function newId() {
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const description = clip(raw.description, LIMITS.description).trim();
  if (!description) return null;
  return {
    id: clip(raw.id, LIMITS.id).trim() || newId(),
    category: clip(raw.category, LIMITS.category).trim(),
    description,
    hsCode: clip(raw.hsCode, LIMITS.hsCode).trim(),
    origin: clip(raw.origin, LIMITS.origin).trim().toUpperCase() || "VN",
    sampleQuantity: Math.max(0, Math.min(99999, Number(raw.sampleQuantity) || 0)),
    unit: clip(raw.unit, LIMITS.unit).trim().toUpperCase() || "PCE",
    unitPriceUsd: Math.max(0, Number(raw.unitPriceUsd) || 0),
    kgPerUnit: Math.max(0, Number(raw.kgPerUnit) || 0),
  };
}

export function emptyInvoiceCatalog() {
  return { version: 1, items: [] };
}

export function normalizeInvoiceCatalogLoose(raw) {
  if (!raw || typeof raw !== "object") return emptyInvoiceCatalog();
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = [];
  for (const x of itemsRaw) {
    const item = clampItem(x);
    if (item) items.push(item);
    if (items.length >= LIMITS.itemCount) break;
  }
  const version = Number(raw.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : 1,
    items,
  };
}
