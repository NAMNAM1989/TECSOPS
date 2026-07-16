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

/** Chuẩn hoá AWB đủ 11 chữ số mới so khớp toàn cục (khớp assertAwbUnique). */
export function awbKeyForMatch(awb) {
  const key = awbDigitsKey(awb);
  return key.length >= 11 ? key.slice(0, 11) : key.length >= 8 ? key : "";
}

export function isValidAwb(awb) {
  return awbDigitsKey(awb).length === 11;
}

/**
 * Lô booking trống AWB nhưng đã có dữ liệu khớp dòng Sheet (chuyến/khách/DEST/kho/kiện-kg).
 */
export function blankBookingMatchesSheetRow(existing, row, sessionDate) {
  if (!existing || existing.sessionDate !== sessionDate) return false;
  if (isValidAwb(existing.awb) || !isValidAwb(row.awb)) return false;

  const flight = normStr(row.flight).toUpperCase();
  if (!flight || flight !== normStr(existing.flight).toUpperCase()) return false;
  if (normCustomer(existing.customer) !== normCustomer(row.customer)) return false;
  if (normStr(existing.dest).toUpperCase() !== normStr(row.dest).toUpperCase()) return false;
  if (normStr(existing.warehouse) !== normStr(row.warehouse)) return false;

  const ePcs = normNum(existing.pcs);
  const sPcs = normNum(row.pcs);
  if (ePcs != null && sPcs != null && ePcs !== sPcs) return false;

  const eKg = normNum(existing.kg);
  const sKg = normNum(row.kg);
  if (eKg != null && sKg != null && eKg !== sKg) return false;

  return true;
}

/** Tìm lô cùng phiên thiếu AWB nhưng khớp fingerprint Sheet. */
export function findBlankAwbBookingInSession(rows, sessionDate, sheetRow, claimedIds = null) {
  for (const r of rows) {
    if (r.sessionDate !== sessionDate) continue;
    if (claimedIds?.has(r.id)) continue;
    if (blankBookingMatchesSheetRow(r, sheetRow, sessionDate)) return r;
  }
  return null;
}

/**
 * Khớp theo AWB trước; nếu không có — thử ghép lô booking trống AWB.
 * @param {{ inSession: Map<string, object> }} awbIndexes
 */
export function resolveExistingForSheetRow(rows, awbIndexes, sessionDate, sheetRow, claimedBlankIds = null) {
  const key = awbKeyForMatch(sheetRow.awb);
  if (key.length >= 11) {
    const byAwb = awbIndexes.inSession.get(key) ?? null;
    if (byAwb) return byAwb;
  }
  return findBlankAwbBookingInSession(rows, sessionDate, sheetRow, claimedBlankIds);
}

/** Tìm lô cùng AWB trong phiên (bất kể kho). */
export function findExistingInSession(state, sessionDate, awb) {
  const key = awbKeyForMatch(awb);
  if (!key) return null;
  return (
    state.rows.find(
      (r) => r.sessionDate === sessionDate && awbKeyForMatch(r.awb) === key
    ) ?? null
  );
}

/** AWB đã có trên web ở phiên khác — không được ADD lại. */
export function findExistingOtherSession(state, sessionDate, awb) {
  const key = awbKeyForMatch(awb);
  if (key.length < 11) return null;
  return (
    state.rows.find(
      (r) => r.sessionDate !== sessionDate && awbKeyForMatch(r.awb) === key
    ) ?? null
  );
}

/** Chỉ số dòng đầu tiên theo AWB trong batch Sheet (cùng tab/ngày). */
export function sheetAwbFirstIndexByKey(rows) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const key = awbKeyForMatch(rows[i].awb);
    if (!key) continue;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
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
    dimWeightKg: row.dimWeightKg ?? null,
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

  if (isValidAwb(patch.awb) && !isValidAwb(existing.awb)) return true;

  if (existing.warehouse !== patch.warehouse) return true;
  if (normCustomer(existing.customer) !== normCustomer(patch.customer)) return true;
  if (normStr(existing.flight).toUpperCase() !== normStr(patch.flight).toUpperCase()) return true;
  if (normStr(existing.flightDate).toUpperCase() !== normStr(patch.flightDate).toUpperCase()) return true;
  if (normStr(existing.cutoff) !== normStr(patch.cutoff)) return true;
  if (normStr(existing.cutoffNote).toUpperCase() !== normStr(patch.cutoffNote).toUpperCase()) return true;
  if (normStr(existing.dest).toUpperCase() !== normStr(patch.dest).toUpperCase()) return true;
  if (normNum(existing.pcs) !== normNum(patch.pcs)) return true;
  if (normNum(existing.kg) !== normNum(patch.kg)) return true;
  if (normNum(existing.dimWeightKg) !== normNum(patch.dimWeightKg)) return true;
  if (normStr(existing.note) !== normStr(patch.note)) return true;
  if (normStr(existing.consigneeNamePrint) !== normStr(patch.consigneeNamePrint)) return true;
  return false;
}

/**
 * @returns {"new"|"update"|"duplicate"|"sheet_duplicate"|"awb_taken"}
 */
export function sheetRowSyncStatus(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  if (!existing) return "new";
  if (sheetRowNeedsUpdate(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId)) {
    return "update";
  }
  return "duplicate";
}

/**
 * Trạng thái cuối sau khi xét trùng AWB trong Sheet và AWB đã có phiên khác.
 * @param {{ existing: object|null, otherSession: object|null, sheetFirstIndex: number, rowIndex: number }} ctx
 */
export function resolveSheetRowSyncStatus(ctx, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  const { existing, otherSession, sheetFirstIndex, rowIndex } = ctx;

  if (sheetFirstIndex !== rowIndex) {
    return {
      syncStatus: "sheet_duplicate",
      sheetDuplicateOfIndex: sheetFirstIndex,
      takenSessionDate: null,
    };
  }

  if (!existing && otherSession) {
    return {
      syncStatus: "awb_taken",
      sheetDuplicateOfIndex: null,
      takenSessionDate: otherSession.sessionDate ?? null,
    };
  }

  const syncStatus = sheetRowSyncStatus(
    existing,
    row,
    sessionDate,
    customers,
    lookupCustomerCode,
    lookupCustomerId
  );
  return {
    syncStatus,
    sheetDuplicateOfIndex: null,
    takenSessionDate: null,
  };
}

/** Dòng không được chọn / nhập. */
export function sheetRowIsBlocked(syncStatus) {
  return syncStatus === "duplicate" || syncStatus === "sheet_duplicate" || syncStatus === "awb_taken";
}
