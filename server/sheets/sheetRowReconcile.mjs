import { awbDigitsKey } from "./awbFormat.mjs";
import { sessionYmdToFlightDateToken } from "./bookDateMatch.mjs";

function normStr(v) {
  return String(v ?? "").trim();
}

function normCustomer(v) {
  return normStr(v).toLowerCase();
}

function normNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Tìm lô cùng AWB trong phiên (bất kể kho). */
export function findExistingInSession(state, sessionDate, awb) {
  const key = awbDigitsKey(awb);
  if (key.length < 8) return null;
  return (
    state.rows.find(
      (r) => r.sessionDate === sessionDate && awbDigitsKey(r.awb) === key
    ) ?? null
  );
}

/** @returns {Record<string, unknown>} patch từ Sheet → shipment trên web */
export function sheetRowToPatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  const customer = normStr(row.customer);
  const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
  return {
    awb: row.awb,
    flight: row.flight,
    flightDate: row.flightDate || sessionFlightDate,
    cutoff: row.cutoff,
    cutoffNote: row.cutoffNote,
    note: row.note,
    dest: row.dest,
    warehouse: row.warehouse,
    pcs: row.pcs,
    kg: row.kg,
    customer,
    customerCode: lookupCustomerCode(customers, customer),
    customerId: lookupCustomerId(customers, customer),
    consigneeNamePrint: row.consigneeNamePrint,
  };
}

/** So sánh lô web với dữ liệu Sheet — khác kho/khách/chuyến/… → cần cập nhật. */
export function sheetRowNeedsUpdate(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  if (!existing) return false;
  const patch = sheetRowToPatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId);

  if (existing.warehouse !== patch.warehouse) return true;
  if (normCustomer(existing.customer) !== normCustomer(patch.customer)) return true;
  if (normStr(existing.flight).toUpperCase() !== normStr(patch.flight).toUpperCase()) return true;
  if (normStr(existing.flightDate).toUpperCase() !== normStr(patch.flightDate).toUpperCase()) return true;
  if (normStr(existing.cutoff) !== normStr(patch.cutoff)) return true;
  if (normStr(existing.cutoffNote).toUpperCase() !== normStr(patch.cutoffNote).toUpperCase()) return true;
  if (normStr(existing.dest).toUpperCase() !== normStr(patch.dest).toUpperCase()) return true;
  if (normNum(existing.pcs) !== normNum(patch.pcs)) return true;
  if (normNum(existing.kg) !== normNum(patch.kg)) return true;
  if (normStr(existing.note) !== normStr(patch.note)) return true;
  if (normStr(existing.consigneeNamePrint) !== normStr(patch.consigneeNamePrint)) return true;
  return false;
}

/**
 * @returns {"new"|"update"|"duplicate"}
 */
export function sheetRowSyncStatus(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  if (!existing) return "new";
  if (sheetRowNeedsUpdate(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId)) {
    return "update";
  }
  return "duplicate";
}
