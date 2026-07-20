/**
 * Khớp cột khách Sheet với danh bạ — ưu tiên Short Code (như Ops nhập tay),
 * rồi Customer Code, rồi tên đầy đủ. Dùng khóa compact (bỏ dấu / khoảng trắng).
 */

/** @param {string} raw */
export function compactCustomerMatchKey(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * @param {object[]} customers
 * @returns {{ code: (name: string) => string, id: (name: string) => string, entry: (name: string) => object | null }}
 */
export function buildCustomerLookups(customers) {
  /** @type {Map<string, object>} */
  const byShort = new Map();
  /** @type {Map<string, object>} */
  const byCode = new Map();
  /** @type {Map<string, object>} */
  const byName = new Map();

  for (const e of customers ?? []) {
    if (!e || typeof e !== "object") continue;
    const shortKey = compactCustomerMatchKey(e.shortCode ?? "");
    const codeKey = compactCustomerMatchKey(e.code ?? "");
    const nameKey = compactCustomerMatchKey(e.name ?? "");
    const nameLower = String(e.name ?? "")
      .trim()
      .toLowerCase();
    if (shortKey && !byShort.has(shortKey)) byShort.set(shortKey, e);
    if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, e);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, e);
    if (nameLower && !byName.has(nameLower)) byName.set(nameLower, e);
  }

  function resolveEntry(raw) {
    const t = String(raw ?? "").trim();
    if (!t) return null;
    const compact = compactCustomerMatchKey(t);
    const lower = t.toLowerCase();
    return (
      (compact ? byShort.get(compact) : null) ??
      (compact ? byCode.get(compact) : null) ??
      byName.get(lower) ??
      (compact ? byName.get(compact) : null) ??
      null
    );
  }

  /** Hỗ trợ cả (name) và (customers, name) — sheetRowToPatch gọi 2 tham số. */
  function code(customersOrName, maybeName) {
    const name = arguments.length >= 2 ? maybeName : customersOrName;
    return resolveEntry(name)?.code?.trim() ?? "";
  }

  function id(customersOrName, maybeName) {
    const name = arguments.length >= 2 ? maybeName : customersOrName;
    return resolveEntry(name)?.id?.trim() ?? "";
  }

  return { entry: resolveEntry, code, id };
}

/** @param {object[]} customers @param {string} customerName */
export function lookupCustomerCode(customers, customerName) {
  return buildCustomerLookups(customers).code(customerName);
}

/** @param {object[]} customers @param {string} customerName */
export function lookupCustomerId(customers, customerName) {
  return buildCustomerLookups(customers).id(customerName);
}
