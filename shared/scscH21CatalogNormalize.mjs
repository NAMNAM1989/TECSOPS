/**
 * Chuẩn hóa catalog H21 SCSC (shared client/server).
 * Scope cứng: chỉ warehouse SCSC.
 */

export const SCSC_H21_WAREHOUSE_SCOPE = "SCSC";

const UOM_ALIASES = {
  UNK: "BAG",
  UNA: "BAG",
  UNC: "PCE",
};

function str(v, max = 500) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Khóa so trùng mô tả: bỏ khoảng trắng thừa, không phân biệt hoa/thường. */
export function scscH21DescriptionKey(description) {
  return str(description, 800).toLowerCase();
}

function num(v, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normHs(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v)).replace(/\D/g, "").slice(0, 12);
  }
  return str(v, 32).replace(/\D/g, "").slice(0, 12);
}

function normUom(v, fallback = "PCE") {
  const u = str(v, 12).toUpperCase();
  if (!u) return fallback;
  return UOM_ALIASES[u] || u.slice(0, 12);
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `scsc-h21-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @param {{ keepId?: boolean, sortOrder?: number }} [opts]
 */
export function normalizeScscH21CatalogItem(raw, opts = {}) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const description = str(o.description ?? o.goodsDescription ?? o.name, 800);
  if (!description) return null;
  const id = opts.keepId !== false && str(o.id, 64) ? str(o.id, 64) : newId();
  const qty1 = Math.max(0, num(o.qty1 ?? o.quantity, 0));
  const unitPrice = Math.max(0, num(o.unitPrice ?? o.unit_price, 0));
  let amount = Math.max(0, num(o.amount, 0));
  if (!amount && qty1 && unitPrice) amount = Math.round(qty1 * unitPrice * 10000) / 10000;
  const active = o.active === false || o.active === 0 || o.active === "0" ? false : true;
  return {
    id,
    category: str(o.category ?? o.loaiHang, 80).toUpperCase(),
    description,
    hsCode: normHs(o.hsCode ?? o.hs_code ?? o.maHs),
    origin: str(o.origin ?? o.xuatXu, 40).toUpperCase() || "VIETNAM",
    qty1,
    uom1: normUom(o.uom1 ?? o.dvt1, "PCE"),
    qty2: Math.max(0, num(o.qty2, 0)),
    uom2: normUom(o.uom2 ?? o.dvt2, "KGM"),
    unitPrice,
    amount,
    unitFactor: Math.max(0, num(o.unitFactor ?? o.unit_factor ?? o.quyCach, 0)),
    sortOrder:
      typeof opts.sortOrder === "number"
        ? opts.sortOrder
        : Math.max(0, Math.trunc(num(o.sortOrder ?? o.sort_order, 0))),
    warehouseScope: SCSC_H21_WAREHOUSE_SCOPE,
    active,
    updatedAt: o.updatedAt != null ? String(o.updatedAt) : o.updated_at != null ? String(o.updated_at) : null,
  };
}

/**
 * @param {unknown} list
 * @returns {ReturnType<typeof normalizeScscH21CatalogItem>[]}
 */
export function clampScscH21Catalog(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seenIds = new Set();
  let i = 0;
  for (const raw of list) {
    const item = normalizeScscH21CatalogItem(raw, { keepId: true, sortOrder: i });
    if (!item) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    item.sortOrder = i++;
    out.push(item);
  }
  return out;
}

/**
 * Tìm mô tả trùng trong danh sách (không phân biệt hoa thường).
 * @param {unknown} list
 * @param {{ exceptId?: string }} [opts]
 * @returns {{ key: string, description: string, ids: string[] }[]}
 */
export function findDuplicateScscH21Descriptions(list, opts = {}) {
  const exceptId = opts.exceptId ? String(opts.exceptId) : "";
  /** @type {Map<string, { description: string, ids: string[] }>} */
  const byKey = new Map();
  if (!Array.isArray(list)) return [];
  for (const raw of list) {
    const item = normalizeScscH21CatalogItem(raw, { keepId: true });
    if (!item) continue;
    if (exceptId && item.id === exceptId) continue;
    const key = scscH21DescriptionKey(item.description);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) prev.ids.push(item.id);
    else byKey.set(key, { description: item.description, ids: [item.id] });
  }
  const dups = [];
  for (const [key, v] of byKey) {
    if (v.ids.length > 1) dups.push({ key, description: v.description, ids: v.ids });
  }
  return dups;
}

/**
 * Kiểm tra mô tả đã có trong catalog (trừ exceptId).
 * @param {unknown} list
 * @param {string} description
 * @param {{ exceptId?: string }} [opts]
 * @returns {{ description: string, id: string } | null}
 */
export function findScscH21DescriptionConflict(list, description, opts = {}) {
  const key = scscH21DescriptionKey(description);
  if (!key || !Array.isArray(list)) return null;
  const exceptId = opts.exceptId ? String(opts.exceptId) : "";
  for (const raw of list) {
    const item = normalizeScscH21CatalogItem(raw, { keepId: true });
    if (!item) continue;
    if (exceptId && item.id === exceptId) continue;
    if (scscH21DescriptionKey(item.description) === key) {
      return { description: item.description, id: item.id };
    }
  }
  return null;
}

/**
 * Parse dòng Excel (header tiếng Việt hoặc English).
 * @param {Record<string, unknown>} row
 */
export function catalogItemFromExcelRow(row) {
  if (!row || typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  return normalizeScscH21CatalogItem(
    {
      category: r["LOẠI HÀNG"] ?? r["Loại hàng"] ?? r.category ?? r.Category,
      description: r["Tên hàng"] ?? r.description ?? r.Description ?? r["TÊN HÀNG"],
      hsCode: r["Mã HS"] ?? r["MÃ HS"] ?? r.hsCode ?? r["HS code"],
      origin: r["XUẤT XỨ"] ?? r["Xuất xứ"] ?? r.origin,
      qty1: r["LƯỢNG 1"] ?? r["Lượng 1"] ?? r.qty1 ?? r.Quantity,
      uom1: r["DVT 1"] ?? r["ĐVT 1"] ?? r.uom1 ?? r.Unit,
      qty2: r["LƯỢNG 2"] ?? r["Lượng 2"] ?? r.qty2,
      uom2: r["DVT 2"] ?? r["ĐVT 2"] ?? r.uom2,
      unitPrice: r["ĐƠN GIÁ"] ?? r["Đơn giá"] ?? r.unitPrice ?? r["U.Price"],
      amount: r["TRỊ GIÁ"] ?? r["TRỊ GIÁ "] ?? r["Trị giá"] ?? r.amount ?? r.Amount,
      unitFactor: r["QUY CÁCH"] ?? r["Quy cách"] ?? r.unitFactor,
      active: true,
    },
    { keepId: false }
  );
}

/**
 * @param {unknown} catalogItem
 * @returns {object | null}
 */
export function invoiceLineFromCatalogItem(catalogItem) {
  const item = normalizeScscH21CatalogItem(catalogItem, { keepId: true });
  if (!item) return null;
  const quantity = item.qty1 > 0 ? item.qty1 : 1;
  const weightKg =
    item.uom2 === "KGM" && item.qty2 > 0
      ? item.qty2
      : item.unitFactor > 0
        ? Math.round(quantity * item.unitFactor * 1000) / 1000
        : 0;
  const unitPrice = item.unitPrice;
  const amount =
    item.amount > 0 ? item.amount : Math.round(quantity * unitPrice * 10000) / 10000;
  return {
    id: newId(),
    catalogItemId: item.id,
    description: item.description,
    hsCode: item.hsCode,
    origin: item.origin,
    quantity,
    uom: item.uom1,
    weightKg,
    unitPrice,
    amount,
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeScscH21InvoiceLine(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const description = str(o.description, 800);
  if (!description) return null;
  const quantity = Math.max(0, num(o.quantity ?? o.qty1, 0));
  const unitPrice = Math.max(0, num(o.unitPrice, 0));
  let amount = Math.max(0, num(o.amount, 0));
  if (!amount && quantity && unitPrice) {
    amount = Math.round(quantity * unitPrice * 10000) / 10000;
  }
  return {
    id: str(o.id, 64) || newId(),
    catalogItemId: str(o.catalogItemId ?? o.catalog_item_id, 64) || null,
    description,
    hsCode: normHs(o.hsCode ?? o.hs_code),
    origin: str(o.origin, 40).toUpperCase() || "VIETNAM",
    quantity,
    uom: normUom(o.uom ?? o.uom1, "PCE"),
    weightKg: Math.max(0, num(o.weightKg ?? o.weight_kg ?? o.qty2, 0)),
    unitPrice,
    amount,
  };
}

/**
 * @param {unknown} list
 */
export function clampScscH21InvoiceLines(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const line = normalizeScscH21InvoiceLine(raw);
    if (line) out.push(line);
  }
  return out;
}

const CARGO_FAMILY_MODES = new Set([
  "auto",
  "frozen",
  "fruit",
  "food",
  "garment",
  "general",
]);

/**
 * @param {unknown} raw
 * @param {number} [seqFallback]
 */
export function normalizeScscH21InvoiceDeclaration(raw, seqFallback = 1) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const lines = clampScscH21InvoiceLines(o.lines ?? o.items);
  const modeRaw = str(o.cargoFamilyMode ?? o.cargo_family_mode ?? o.cargoFamily, 24).toLowerCase();
  const cargoFamilyMode = CARGO_FAMILY_MODES.has(modeRaw) ? modeRaw : "auto";
  const declarationKg = Math.max(0, num(o.declarationKg ?? o.declaration_kg ?? o.kg, 0));
  const seq = Math.max(1, Math.trunc(num(o.seq, seqFallback)) || seqFallback);
  return {
    id: str(o.id, 64) || newId(),
    seq,
    declarationKg,
    cargoFamilyMode,
    lines,
  };
}

/**
 * @param {unknown} list
 */
export function clampScscH21InvoiceDeclarations(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const d = normalizeScscH21InvoiceDeclaration(list[i], i + 1);
    if (d) out.push(d);
  }
  return out.map((d, i) => ({ ...d, seq: i + 1 }));
}
