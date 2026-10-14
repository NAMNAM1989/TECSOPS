import type {
  CustomerDirectoryEntry,
  CustomerH21GoodsItem,
  CustomerH21InvoicePreset,
} from "../types/customerDirectory";
import { CUSTOMER_PROFILE_LIMITS } from "../../shared/customerProfileLimits.mjs";

export type H21PresetWarehouseScope = "SCSC" | "TCS";

/** Catalog tối thiểu để enrich / legacy resolve. */
export type H21PresetCatalogLike = {
  id: string;
  description?: string;
  category?: string;
  hsCode?: string;
  origin?: string;
  uom1?: string;
  unitPrice?: number;
  active?: boolean;
  unitFactor?: number;
  qty1?: number;
  qty2?: number;
  uom2?: string;
  amount?: number;
  sortOrder?: number;
  warehouseScope?: string;
};

function clipId(s: unknown): string {
  return String(s ?? "").trim().slice(0, 64);
}

function clipDesc(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function newGoodsId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `kh-${crypto.randomUUID()}`;
  }
  return `kh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeH21PresetWarehouseScope(
  raw: unknown
): H21PresetWarehouseScope | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "SCSC" || s === "TCS") return s;
  return null;
}

export function clampCustomerH21GoodsItem(
  raw: unknown
): CustomerH21GoodsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const description = clipDesc(o.description);
  if (!description) return null;
  const id = clipId(o.id) || newGoodsId();
  const hsCode = String(o.hsCode ?? o.hs_code ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);
  const category = clipDesc(o.category).slice(0, 80);
  const origin = clipDesc(o.origin).slice(0, 80) || "VIETNAM";
  const uom1 = String(o.uom1 ?? o.uom ?? "PCE")
    .trim()
    .toUpperCase()
    .slice(0, 8) || "PCE";
  const unitPriceRaw = Number(o.unitPrice ?? o.unit_price);
  const unitPrice =
    Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0
      ? Math.round(unitPriceRaw * 10000) / 10000
      : 0;
  const factorRaw = Number(o.unitFactor ?? o.unit_factor);
  // Mặc định 1 kg/ĐVT nếu thiếu — để vẫn tạo được invoice từ list đã up.
  const unitFactor =
    Number.isFinite(factorRaw) && factorRaw > 0
      ? Math.round(factorRaw * 1e6) / 1e6
      : 1;
  const sourceCatalogItemId =
    clipId(o.sourceCatalogItemId ?? o.source_catalog_item_id) || undefined;
  return {
    id,
    description,
    unitFactor,
    ...(hsCode ? { hsCode } : {}),
    ...(category ? { category } : {}),
    ...(origin ? { origin } : {}),
    ...(uom1 ? { uom1 } : {}),
    ...(unitPrice > 0 ? { unitPrice } : {}),
    ...(sourceCatalogItemId ? { sourceCatalogItemId } : {}),
  };
}

function clampGoodsItems(raw: unknown): CustomerH21GoodsItem[] {
  if (!Array.isArray(raw)) return [];
  const L = CUSTOMER_PROFILE_LIMITS;
  const out: CustomerH21GoodsItem[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const item = clampCustomerH21GoodsItem(x);
    if (!item) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= L.h21PresetCatalogIds) break;
  }
  return out;
}

/** Chuẩn hóa một preset; bỏ nếu thiếu scope hoặc không còn data. */
export function clampCustomerH21InvoicePreset(
  raw: unknown
): CustomerH21InvoicePreset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const warehouseScope = normalizeH21PresetWarehouseScope(
    o.warehouseScope ?? o.warehouse_scope
  );
  if (!warehouseScope) return null;
  const L = CUSTOMER_PROFILE_LIMITS;
  const seen = new Set<string>();
  const catalogItemIds: string[] = [];
  const rawIds = Array.isArray(o.catalogItemIds)
    ? o.catalogItemIds
    : Array.isArray(o.catalog_item_ids)
      ? o.catalog_item_ids
      : [];
  for (const x of rawIds) {
    const id = clipId(x);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    catalogItemIds.push(id);
    if (catalogItemIds.length >= L.h21PresetCatalogIds) break;
  }
  const items = clampGoodsItems(o.items);
  // Đồng bộ catalogItemIds từ items có source (legacy consumers).
  if (items.length) {
    for (const it of items) {
      const sid = it.sourceCatalogItemId;
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      catalogItemIds.push(sid);
      if (catalogItemIds.length >= L.h21PresetCatalogIds) break;
    }
  }
  if (!items.length && !catalogItemIds.length) {
    // Cho phép preset «trống» khi đang clear — vẫn giữ meta stamp/lineCount.
  }
  const defaultStampId = clipId(o.defaultStampId ?? o.default_stamp_id) || undefined;
  let preferredLineCount: number | undefined;
  const n = Number(o.preferredLineCount ?? o.preferred_line_count);
  if (Number.isFinite(n) && n >= 1) {
    preferredLineCount = Math.min(50, Math.max(1, Math.round(n)));
  }
  return {
    warehouseScope,
    ...(items.length ? { items } : {}),
    ...(catalogItemIds.length ? { catalogItemIds } : { catalogItemIds: [] }),
    ...(defaultStampId ? { defaultStampId } : {}),
    ...(preferredLineCount != null ? { preferredLineCount } : {}),
  };
}

export function clampCustomerH21InvoicePresets(
  list: unknown
): CustomerH21InvoicePreset[] {
  if (!Array.isArray(list)) return [];
  const L = CUSTOMER_PROFILE_LIMITS;
  const byScope = new Map<H21PresetWarehouseScope, CustomerH21InvoicePreset>();
  for (const raw of list) {
    const p = clampCustomerH21InvoicePreset(raw);
    if (!p) continue;
    byScope.set(p.warehouseScope, p);
    if (byScope.size >= L.h21PresetCount) break;
  }
  return [...byScope.values()];
}

export function getCustomerH21Preset(
  entry: CustomerDirectoryEntry | null | undefined,
  warehouseScope: H21PresetWarehouseScope
): CustomerH21InvoicePreset | null {
  if (!entry?.h21InvoicePresets?.length) return null;
  const found = entry.h21InvoicePresets.find(
    (p) => p.warehouseScope === warehouseScope
  );
  return found ?? null;
}

/** Ghi / thay preset một kho trên entry (immutably). */
export function upsertCustomerH21Preset(
  entry: CustomerDirectoryEntry,
  preset: CustomerH21InvoicePreset
): CustomerDirectoryEntry {
  const next = clampCustomerH21InvoicePreset(preset);
  if (!next) return entry;
  const others = (entry.h21InvoicePresets ?? []).filter(
    (p) => p.warehouseScope !== next.warehouseScope
  );
  return {
    ...entry,
    h21InvoicePresets: clampCustomerH21InvoicePresets([...others, next]),
  };
}

/** Đổi snapshot KH → shape catalog để random / sidebar / import dùng chung. */
export function customerH21GoodsAsCatalogItem(
  item: CustomerH21GoodsItem,
  warehouseScope: H21PresetWarehouseScope
): H21PresetCatalogLike & {
  description: string;
  category: string;
  hsCode: string;
  origin: string;
  qty1: number;
  uom1: string;
  qty2: number;
  uom2: string;
  unitPrice: number;
  amount: number;
  unitFactor: number;
  sortOrder: number;
  active: boolean;
  warehouseScope: string;
} {
  const unitFactor = Number(item.unitFactor) > 0 ? Number(item.unitFactor) : 1;
  const unitPrice = Number(item.unitPrice) > 0 ? Number(item.unitPrice) : 0;
  return {
    id: item.id,
    description: item.description,
    category: item.category?.trim() || "KH",
    hsCode: item.hsCode?.trim() || "",
    origin: item.origin?.trim() || "VIETNAM",
    qty1: 1,
    uom1: item.uom1?.trim() || "PCE",
    qty2: unitFactor,
    uom2: "KGM",
    unitPrice,
    amount: unitPrice,
    unitFactor,
    sortOrder: 0,
    active: true,
    warehouseScope,
  };
}

/**
 * Pool catalog theo preset legacy (catalogItemIds).
 */
export function resolveCustomerH21CatalogPool<T extends H21PresetCatalogLike>(
  catalog: readonly T[],
  preset: CustomerH21InvoicePreset | null | undefined,
  opts?: { requireUnitFactor?: boolean }
): T[] {
  if (!preset?.catalogItemIds?.length) return [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const requireFactor = opts?.requireUnitFactor !== false;
  const out: T[] = [];
  for (const id of preset.catalogItemIds) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.active === false) continue;
    if (requireFactor && !(Number(item.unitFactor) > 0)) continue;
    out.push(item);
  }
  return out;
}

/** Migrate catalogItemIds → items (một lần, khi chưa có items). */
export function hydrateCustomerH21PresetItemsFromCatalog<
  T extends H21PresetCatalogLike,
>(
  preset: CustomerH21InvoicePreset | null | undefined,
  catalog: readonly T[]
): CustomerH21GoodsItem[] {
  if (!preset) return [];
  if (preset.items?.length) {
    return clampGoodsItems(preset.items);
  }
  if (!preset.catalogItemIds?.length) return [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const out: CustomerH21GoodsItem[] = [];
  for (const id of preset.catalogItemIds) {
    const c = byId.get(id);
    if (!c || c.active === false) continue;
    const desc = clipDesc(c.description);
    if (!desc) continue;
    out.push(
      clampCustomerH21GoodsItem({
        id: `kh-mig-${id}`.slice(0, 64),
        description: desc,
        hsCode: c.hsCode,
        category: c.category,
        origin: c.origin,
        uom1: c.uom1,
        unitPrice: c.unitPrice,
        unitFactor: Number(c.unitFactor) > 0 ? c.unitFactor : 1,
        sourceCatalogItemId: id,
      })!
    );
  }
  return out;
}

/** Thêm / gộp snapshot vào preset. */
export function upsertCustomerH21GoodsItems(
  preset: CustomerH21InvoicePreset | null,
  warehouseScope: H21PresetWarehouseScope,
  nextItems: readonly CustomerH21GoodsItem[],
  mode: "merge" | "replace"
): CustomerH21InvoicePreset {
  const base = preset ?? { warehouseScope, catalogItemIds: [], items: [] };
  let items: CustomerH21GoodsItem[];
  if (mode === "replace") {
    items = clampGoodsItems(nextItems);
  } else {
    const byKey = new Map<string, CustomerH21GoodsItem>();
    for (const it of base.items ?? []) {
      byKey.set(it.id, it);
      byKey.set(clipDesc(it.description).toLowerCase(), it);
    }
    const merged = [...(base.items ?? [])];
    for (const raw of nextItems) {
      const it = clampCustomerH21GoodsItem(raw);
      if (!it) continue;
      const descKey = it.description.toLowerCase();
      const existing =
        byKey.get(it.id) ?? byKey.get(descKey) ?? null;
      if (existing) {
        const idx = merged.findIndex((x) => x.id === existing.id);
        if (idx >= 0) {
          merged[idx] = { ...existing, ...it, id: existing.id };
        }
      } else {
        merged.push(it);
        byKey.set(it.id, it);
        byKey.set(descKey, it);
      }
    }
    items = clampGoodsItems(merged);
  }
  const catalogItemIds = items
    .map((x) => x.sourceCatalogItemId)
    .filter((x): x is string => Boolean(x));
  return clampCustomerH21InvoicePreset({
    ...base,
    warehouseScope,
    items,
    catalogItemIds,
  })!;
}

export function removeCustomerH21GoodsItem(
  preset: CustomerH21InvoicePreset,
  goodsId: string
): CustomerH21InvoicePreset {
  const id = clipId(goodsId);
  const items = (preset.items ?? []).filter((x) => x.id !== id);
  const catalogItemIds = items
    .map((x) => x.sourceCatalogItemId)
    .filter((x): x is string => Boolean(x));
  return clampCustomerH21InvoicePreset({
    ...preset,
    items,
    catalogItemIds,
  })!;
}

/** @deprecated — dùng upsertCustomerH21GoodsItems */
export function appendCatalogIdsToPreset(
  preset: CustomerH21InvoicePreset | null,
  warehouseScope: H21PresetWarehouseScope,
  ids: readonly string[]
): CustomerH21InvoicePreset {
  const base = preset ?? { warehouseScope, catalogItemIds: [] };
  const seen = new Set(base.catalogItemIds ?? []);
  const next = [...(base.catalogItemIds ?? [])];
  const L = CUSTOMER_PROFILE_LIMITS;
  for (const raw of ids) {
    const id = clipId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
    if (next.length >= L.h21PresetCatalogIds) break;
  }
  return clampCustomerH21InvoicePreset({
    ...base,
    warehouseScope,
    catalogItemIds: next,
  })!;
}

/** @deprecated */
export function removeCatalogIdFromPreset(
  preset: CustomerH21InvoicePreset,
  catalogItemId: string
): CustomerH21InvoicePreset {
  const id = clipId(catalogItemId);
  const catalogItemIds = (preset.catalogItemIds ?? []).filter((x) => x !== id);
  const items = (preset.items ?? []).filter(
    (x) => x.sourceCatalogItemId !== id && x.id !== id
  );
  return clampCustomerH21InvoicePreset({
    ...preset,
    catalogItemIds,
    items,
  })!;
}

/**
 * Legacy: mode `customer` = cả Data KH.
 * Khi đã khóa pool KH, migrate sang `auto` để vẫn chọn nhóm (TP / đông lạnh…).
 */
export function withPreferredCustomerCargoFamilyMode<
  T extends { cargoFamilyMode: string; lines: readonly unknown[] },
>(splits: readonly T[], hasCustomerPool: boolean): T[] {
  if (!hasCustomerPool) return [...splits];
  return splits.map((s) => {
    if (s.cargoFamilyMode !== "customer") return s;
    if (s.lines.length > 0) return s;
    return { ...s, cargoFamilyMode: "auto" };
  });
}

/** Áp số dòng ưa thích khi KH đã có Data H21 (mọi nhóm trong pool KH). */
export function withPreferredLineCountOnCustomerSplits<
  T extends {
    cargoFamilyMode: string;
    lines: readonly unknown[];
    lineCountDraft: string;
  },
>(splits: readonly T[], preferredLineCount: number | undefined): T[] {
  if (preferredLineCount == null || preferredLineCount < 1) return [...splits];
  const n = Math.min(50, Math.max(1, Math.round(preferredLineCount)));
  const draft = String(n);
  return splits.map((s) => {
    if (s.lines.length > 0) return s;
    return { ...s, lineCountDraft: draft };
  });
}

/**
 * KH đã có data H21 tại kho? (snapshot items hoặc legacy ids)
 */
export function isCustomerH21DataBound(
  preset: CustomerH21InvoicePreset | null | undefined
): boolean {
  if ((preset?.items?.length ?? 0) > 0) return true;
  return (preset?.catalogItemIds?.length ?? 0) > 0;
}

/**
 * Catalog làm việc khi khai H21 cho KH đã gán data:
 * ưu tiên snapshot riêng; legacy → resolve từ catalog chung.
 * Không bao giờ trả full catalog.
 */
export function resolveBoundCustomerH21WorkingCatalog<T extends H21PresetCatalogLike>(
  catalog: readonly T[],
  preset: CustomerH21InvoicePreset | null | undefined,
  opts?: { requireUnitFactor?: boolean; warehouseScope?: H21PresetWarehouseScope }
): {
  bound: boolean;
  pool: Array<
    H21PresetCatalogLike & {
      description: string;
      category: string;
      hsCode: string;
      origin: string;
      qty1: number;
      uom1: string;
      qty2: number;
      uom2: string;
      unitPrice: number;
      amount: number;
      unitFactor: number;
      sortOrder: number;
      active: boolean;
      warehouseScope: string;
    }
  >;
  unresolvedCount: number;
  source: "items" | "catalogIds" | "none";
} {
  if (!isCustomerH21DataBound(preset)) {
    return { bound: false, pool: [], unresolvedCount: 0, source: "none" };
  }
  const scope =
    opts?.warehouseScope ??
    preset?.warehouseScope ??
    ("SCSC" as H21PresetWarehouseScope);
  const requireFactor = opts?.requireUnitFactor !== false;

  const items = hydrateCustomerH21PresetItemsFromCatalog(preset, catalog);
  if (items.length > 0 || (preset?.items?.length ?? 0) > 0) {
    const sourceItems =
      (preset?.items?.length ?? 0) > 0 ? clampGoodsItems(preset!.items) : items;
    const pool = sourceItems
      .map((it) => customerH21GoodsAsCatalogItem(it, scope))
      .filter((c) => !requireFactor || c.unitFactor > 0);
    const unresolvedCount = Math.max(0, sourceItems.length - pool.length);
    return {
      bound: true,
      pool,
      unresolvedCount,
      source: (preset?.items?.length ?? 0) > 0 ? "items" : "catalogIds",
    };
  }

  // Legacy thuần ids nhưng catalog không resolve được
  const legacy = resolveCustomerH21CatalogPool(catalog, preset, opts);
  return {
    bound: true,
    pool: legacy.map((c) =>
      customerH21GoodsAsCatalogItem(
        {
          id: c.id,
          description: String(c.description ?? ""),
          hsCode: c.hsCode,
          category: c.category,
          origin: c.origin,
          uom1: c.uom1,
          unitPrice: c.unitPrice,
          unitFactor: Number(c.unitFactor) > 0 ? Number(c.unitFactor) : 1,
          sourceCatalogItemId: c.id,
        },
        scope
      )
    ),
    unresolvedCount: Math.max(
      0,
      (preset?.catalogItemIds?.length ?? 0) - legacy.length
    ),
    source: "catalogIds",
  };
}

/**
 * Tạo snapshot từ dòng catalog Excel đã parse (đủ HS / giá / quy cách).
 * Dùng khi file up là format danh mục H21 (vd. minh khang.xlsx).
 */
export function buildCustomerH21GoodsFromCatalogRows(
  rows: readonly H21PresetCatalogLike[]
): CustomerH21GoodsItem[] {
  const out: CustomerH21GoodsItem[] = [];
  for (const r of rows) {
    const description = clipDesc(r.description);
    if (!description) continue;
    const factor = Number(r.unitFactor);
    out.push(
      clampCustomerH21GoodsItem({
        id: newGoodsId(),
        description,
        hsCode: r.hsCode,
        category: r.category,
        origin: r.origin,
        uom1: r.uom1,
        unitPrice: r.unitPrice,
        unitFactor: Number.isFinite(factor) && factor > 0 ? factor : 1,
        sourceCatalogItemId: clipId(r.id) || undefined,
      })!
    );
  }
  return clampGoodsItems(out);
}

/**
 * Tạo snapshot từ list mô tả đã up (+ enrich catalog nếu khớp).
 * Unmatched vẫn được lưu — đúng yêu cầu «data đã up cho KH».
 */
export function buildCustomerH21GoodsFromQueries(
  queries: readonly string[],
  catalog: readonly H21PresetCatalogLike[],
  opts?: {
    minScore?: number;
    matchFn?: (
      query: string,
      catalog: readonly H21PresetCatalogLike[]
    ) => H21PresetCatalogLike | null;
  }
): { items: CustomerH21GoodsItem[]; matched: number; unmatched: number } {
  const minScore = opts?.minScore ?? 0.42;
  const usedCatalogIds = new Set<string>();
  const items: CustomerH21GoodsItem[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const q of queries) {
    const description = clipDesc(q);
    if (!description) continue;
    let hit: H21PresetCatalogLike | null = null;
    if (opts?.matchFn) {
      hit = opts.matchFn(description, catalog);
    } else {
      let bestScore = 0;
      for (const c of catalog) {
        if (c.active === false) continue;
        if (usedCatalogIds.has(c.id)) continue;
        const score = scoreDesc(description, String(c.description ?? ""));
        if (score < minScore) continue;
        if (score > bestScore) {
          bestScore = score;
          hit = c;
        }
      }
    }
    if (hit) {
      usedCatalogIds.add(hit.id);
      matched += 1;
      items.push(
        clampCustomerH21GoodsItem({
          id: newGoodsId(),
          description,
          hsCode: hit.hsCode,
          category: hit.category,
          origin: hit.origin,
          uom1: hit.uom1,
          unitPrice: hit.unitPrice,
          unitFactor: Number(hit.unitFactor) > 0 ? hit.unitFactor : 1,
          sourceCatalogItemId: hit.id,
        })!
      );
    } else {
      unmatched += 1;
      items.push(
        clampCustomerH21GoodsItem({
          id: newGoodsId(),
          description,
          unitFactor: 1,
          category: "KH",
          origin: "VIETNAM",
          uom1: "PCE",
        })!
      );
    }
  }
  return { items: clampGoodsItems(items), matched, unmatched };
}

function scoreDesc(a: string, b: string): number {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    return 0.85 * (Math.min(na.length, nb.length) / Math.max(na.length, nb.length));
  }
  const ta = new Set(na.split(/[^a-z0-9à-ỹ]+/i).filter((t) => t.length >= 2));
  const tb = new Set(nb.split(/[^a-z0-9à-ỹ]+/i).filter((t) => t.length >= 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / new Set([...ta, ...tb]).size;
}
