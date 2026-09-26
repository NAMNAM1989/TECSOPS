/**
 * Hợp đồng API export ổn định (schemaVersion = 1).
 * Đổi field/ý nghĩa → tăng schemaVersion.
 */

export const EXPORT_API_VERSION = "v1";
export const EXPORT_SCHEMA_VERSION = 1;

export const EXPORT_WAREHOUSES = Object.freeze([
  "TECS-TCS",
  "TECS-SCSC",
  "TCS",
  "SCSC",
]);

const WAREHOUSE_SET = new Set(EXPORT_WAREHOUSES);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/** Exact-match 4 kho; legacy KHO-* → hub TECS. */
export function normalizeExportWarehouse(raw, fallback = null) {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (!u) return fallback;
  if (WAREHOUSE_SET.has(u)) return u;
  if (u === "KHO-SCSC") return "TECS-SCSC";
  if (u === "KHO-TCS") return "TECS-TCS";
  return fallback;
}

export function parseSessionDateParam(raw) {
  const s = String(raw ?? "").trim();
  return YMD_RE.test(s) ? s : null;
}

export function parseExportLimit(raw, fallback = DEFAULT_LIMIT) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

/** core = nhanh; full = kèm field in ấn. */
export function parseExportView(raw) {
  return String(raw ?? "core").trim().toLowerCase() === "full" ? "full" : "core";
}

/** Cursor opaque — sort: session_date, warehouse, stt, id. */
export function encodeExportCursor(parts) {
  const payload = {
    sd: String(parts.sessionDate || ""),
    wh: String(parts.warehouse || ""),
    stt: Number(parts.stt) || 0,
    id: String(parts.id || ""),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeExportCursor(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const id = String(parsed.id || "").trim();
    if (!id) return null;
    return {
      sessionDate: String(parsed.sd || ""),
      warehouse: String(parsed.wh || ""),
      stt: Number(parsed.stt) || 0,
      id,
    };
  } catch {
    return null;
  }
}

function emptyToNull(v) {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

/**
 * @param {object} row
 * @param {"core"|"full"} view
 */
export function toExportShipmentDto(row, view = "core") {
  const core = {
    id: String(row.id || ""),
    stt: Number(row.stt) || 0,
    sessionDate: String(row.sessionDate || ""),
    awb: String(row.awb || ""),
    hawb: String(row.hawb || ""),
    flight: String(row.flight || ""),
    flightDate: String(row.flightDate || ""),
    cutoff: String(row.cutoff || ""),
    cutoffNote: String(row.cutoffNote || ""),
    note: String(row.note || ""),
    dest: String(row.dest || ""),
    warehouse: normalizeExportWarehouse(row.warehouse, String(row.warehouse || "")),
    pcs: row.pcs == null ? null : Number(row.pcs),
    kg: row.kg == null ? null : Number(row.kg),
    dimWeightKg: row.dimWeightKg == null ? null : Number(row.dimWeightKg),
    dimLines: Array.isArray(row.dimLines) ? row.dimLines : null,
    dimDivisor: row.dimDivisor === 5000 || row.dimDivisor === 6000 ? row.dimDivisor : null,
    customer: String(row.customer || ""),
    customerCode: String(row.customerCode || ""),
    customerId: emptyToNull(row.customerId) || "",
    status: String(row.status || ""),
    syncedAt: row.syncedAt ?? null,
  };
  if (view !== "full") return core;
  return {
    ...core,
    customerShipperId: String(row.customerShipperId || ""),
    customerConsigneeId: String(row.customerConsigneeId || ""),
    globalAgentId: String(row.globalAgentId || ""),
    customerAgentId: String(row.customerAgentId || ""),
    customerGoodsId: String(row.customerGoodsId || ""),
    goodsDescriptionPrint: String(row.goodsDescriptionPrint || ""),
    otherRequirementsPrint: String(row.otherRequirementsPrint || ""),
    shipperNamePrint: String(row.shipperNamePrint || ""),
    shipperAddressPrint: String(row.shipperAddressPrint || ""),
    shipperPhonePrint: String(row.shipperPhonePrint || ""),
    shipperEmailPrint: String(row.shipperEmailPrint || ""),
    taxCodePrint: String(row.taxCodePrint || ""),
    agentNamePrint: String(row.agentNamePrint || ""),
    agentAddressPrint: String(row.agentAddressPrint || ""),
    agentPhonePrint: String(row.agentPhonePrint || ""),
    agentEmailPrint: String(row.agentEmailPrint || ""),
    agentTaxCodePrint: String(row.agentTaxCodePrint || ""),
    consigneeNamePrint: String(row.consigneeNamePrint || ""),
    consigneeAddressPrint: String(row.consigneeAddressPrint || ""),
    consigneePhonePrint: String(row.consigneePhonePrint || ""),
    consigneeEmailPrint: String(row.consigneeEmailPrint || ""),
    notifyNamePrint: String(row.notifyNamePrint || ""),
    h21DeclarationShipperId: String(row.h21DeclarationShipperId || ""),
    invoiceItems: Array.isArray(row.invoiceItems) ? row.invoiceItems : undefined,
    invoiceDeclarations: Array.isArray(row.invoiceDeclarations)
      ? row.invoiceDeclarations
      : undefined,
  };
}

export function toExportCustomerDto(row) {
  return {
    id: String(row.id || ""),
    code: String(row.code || ""),
    name: String(row.name || ""),
    syncedAt: row.syncedAt ?? null,
  };
}

export function buildExportEnvelope({
  resource,
  stateVersion,
  query = {},
  items,
  itemKey,
  nextCursor = null,
  generatedAt = new Date().toISOString(),
}) {
  return {
    ok: true,
    apiVersion: EXPORT_API_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    resource,
    stateVersion: Number(stateVersion) || 0,
    generatedAt,
    query,
    count: Array.isArray(items) ? items.length : 0,
    [itemKey]: items,
    nextCursor,
  };
}

export function exportEtag(stateVersion) {
  return `W/"tecsops-export-v${Number(stateVersion) || 0}"`;
}

export function etagMatches(ifNoneMatch, etag) {
  const raw = String(ifNoneMatch || "").trim();
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .some((t) => t === etag || t === etag.replace(/^W\//, "") || `W/${t}` === etag);
}
