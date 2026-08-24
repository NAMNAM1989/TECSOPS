import { awbDigitsKey } from "./awbFormat.mjs";
import { sessionYmdToFlightDateToken } from "./bookDateMatch.mjs";
import { compactCustomerMatchKey } from "./customerSheetLookup.mjs";

function normStr(v) {
  return String(v ?? "").trim();
}

function normCustomer(v) {
  return normStr(v).toLowerCase();
}

function sameCustomerLabel(a, b) {
  const ca = compactCustomerMatchKey(a);
  const cb = compactCustomerMatchKey(b);
  if (ca && cb && ca === cb) return true;
  return normCustomer(a) === normCustomer(b);
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
 * Khớp fingerprint nghiệp vụ (chuyến/khách/DEST/kho/kiện-kg) — không xét AWB.
 * Dùng khi Sheet đổi số AWB hoặc lô web còn trống AWB.
 */
export function lotFingerprintMatchesSheetRow(existing, row, sessionDate) {
  if (!existing || existing.sessionDate !== sessionDate) return false;

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

/**
 * Lô booking trống AWB nhưng đã có dữ liệu khớp dòng Sheet (chuyến/khách/DEST/kho/kiện-kg).
 */
export function blankBookingMatchesSheetRow(existing, row, sessionDate) {
  if (isValidAwb(existing?.awb) || !isValidAwb(row?.awb)) return false;
  return lotFingerprintMatchesSheetRow(existing, row, sessionDate);
}

/**
 * Lô web còn AWB cũ — Sheet đã sửa sang AWB khác, fingerprint vẫn khớp.
 * Không ghép nếu AWB cũ vẫn còn trên Sheet (hai lô thật).
 */
export function replacedAwbBookingMatchesSheetRow(existing, row, sessionDate, sheetAwbKeys) {
  if (!isValidAwb(existing?.awb) || !isValidAwb(row?.awb)) return false;
  const existingKey = awbKeyForMatch(existing.awb);
  const sheetKey = awbKeyForMatch(row.awb);
  if (!existingKey || existingKey === sheetKey) return false;
  if (sheetAwbKeys?.has(existingKey)) return false;
  return lotFingerprintMatchesSheetRow(existing, row, sessionDate);
}

function firstUnclaimedMatch(rows, sessionDate, claimedIds, predicate) {
  for (const r of rows) {
    if (r.sessionDate !== sessionDate) continue;
    if (claimedIds?.has(r.id)) continue;
    if (predicate(r)) return r;
  }
  return null;
}

/** Tìm lô cùng phiên thiếu AWB nhưng khớp fingerprint Sheet. */
export function findBlankAwbBookingInSession(rows, sessionDate, sheetRow, claimedIds = null) {
  return firstUnclaimedMatch(rows, sessionDate, claimedIds, (r) =>
    blankBookingMatchesSheetRow(r, sheetRow, sessionDate)
  );
}

/**
 * Chỉ ghép khi đúng 1 lô web khớp fingerprint — tránh nhập nhầm 2 lô cùng khách/chuyến.
 */
export function findReplacedAwbBookingInSession(
  rows,
  sessionDate,
  sheetRow,
  sheetAwbKeys,
  claimedIds = null
) {
  const hits = [];
  for (const r of rows) {
    if (r.sessionDate !== sessionDate) continue;
    if (claimedIds?.has(r.id)) continue;
    if (replacedAwbBookingMatchesSheetRow(r, sheetRow, sessionDate, sheetAwbKeys)) hits.push(r);
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Khớp theo AWB trước; nếu không có — thử ghép lô trống AWB, rồi AWB Sheet đã sửa.
 * @param {{ inSession: Map<string, object> }} awbIndexes
 * @param {Set<string>|null} sheetAwbKeys AWB 11 số đang có trên tab Sheet
 */
export function resolveExistingForSheetRow(
  rows,
  awbIndexes,
  sessionDate,
  sheetRow,
  claimedBlankIds = null,
  sheetAwbKeys = null
) {
  const key = awbKeyForMatch(sheetRow.awb);
  if (key.length >= 11) {
    const byAwb = awbIndexes.inSession.get(key) ?? null;
    if (byAwb) return byAwb;
  }
  const blank = findBlankAwbBookingInSession(rows, sessionDate, sheetRow, claimedBlankIds);
  if (blank) return blank;
  if (sheetAwbKeys) {
    return findReplacedAwbBookingInSession(
      rows,
      sessionDate,
      sheetRow,
      sheetAwbKeys,
      claimedBlankIds
    );
  }
  return null;
}

export function sheetAwbKeySet(rows) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const row of rows ?? []) {
    const key = awbKeyForMatch(row.awb);
    if (key.length >= 11) keys.add(key);
  }
  return keys;
}

/**
 * Lô web cùng phiên có AWB hợp lệ nhưng không còn trên Sheet.
 * @returns {object[]}
 */
export function findOrphanSessionLots(rows, sessionDate, sheetRows, claimedIds = null) {
  const sheetKeys = sheetAwbKeySet(sheetRows);
  const orphans = [];
  for (const r of rows ?? []) {
    if (r.sessionDate !== sessionDate) continue;
    if (claimedIds?.has(r.id)) continue;
    const key = awbKeyForMatch(r.awb);
    if (key.length < 11) continue;
    if (sheetKeys.has(key)) continue;
    orphans.push(r);
  }
  return orphans;
}

/**
 * @returns {{ kind: "replaced"|"web_only", replacedByAwb: string|null, autoRemove: boolean }}
 */
export function classifySheetOrphan(orphan, sheetRows, sessionDate) {
  const hits = (sheetRows ?? []).filter((row) =>
    lotFingerprintMatchesSheetRow(orphan, row, sessionDate)
  );
  if (hits.length === 1) {
    const status = String(orphan.status ?? "PENDING").toUpperCase();
    const autoRemove = status === "PENDING" || status === "";
    return { kind: "replaced", replacedByAwb: hits[0].awb || null, autoRemove };
  }
  return { kind: "web_only", replacedByAwb: null, autoRemove: false };
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

/** @returns {Record<string, unknown>} patch từ Sheet → shipment trên web (dùng khi ADD) */
export function sheetRowToPatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  const customer = normStr(row.customer);
  const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
  /** @type {Record<string, unknown>} */
  const patch = {
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
    shipperNamePrint: row.shipperNamePrint || "",
    consigneeNamePrint: row.consigneeNamePrint,
  };
  // Sheet BOOK thường không có DIM — không ghi null để khỏi xóa volume đã đo trên Ops.
  if (row.dimWeightKg != null && Number.isFinite(Number(row.dimWeightKg))) {
    patch.dimWeightKg = Number(row.dimWeightKg);
  }
  return patch;
}

/**
 * Patch UPDATE: chỉ ghi field Sheet có giá trị — tránh kéo Sheet trống/lệch cột xóa chuyến·DEST·khách trên Ops.
 * @returns {Record<string, unknown>}
 */
export function sheetRowToUpdatePatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  void sessionDate;
  /** @type {Record<string, unknown>} */
  const patch = {};

  if (isValidAwb(row.awb)) patch.awb = row.awb;
  if (normStr(row.flight)) patch.flight = row.flight;
  if (normStr(row.flightDate)) patch.flightDate = row.flightDate;
  if (normStr(row.cutoff)) patch.cutoff = row.cutoff;
  if (normStr(row.cutoffNote)) patch.cutoffNote = row.cutoffNote;
  if (normStr(row.note)) patch.note = row.note;
  if (normStr(row.dest)) patch.dest = row.dest;
  if (normStr(row.warehouse)) patch.warehouse = row.warehouse;

  if (row.pcs != null && Number.isFinite(Number(row.pcs))) patch.pcs = Number(row.pcs);
  if (row.kg != null && Number.isFinite(Number(row.kg))) patch.kg = Number(row.kg);

  const customer = normStr(row.customer);
  if (customer) {
    patch.customer = customer;
    patch.customerCode = lookupCustomerCode(customers, customer);
    patch.customerId = lookupCustomerId(customers, customer);
  }

  if (normStr(row.shipperNamePrint)) patch.shipperNamePrint = row.shipperNamePrint;
  if (normStr(row.consigneeNamePrint)) patch.consigneeNamePrint = row.consigneeNamePrint;

  if (row.dimWeightKg != null && Number.isFinite(Number(row.dimWeightKg))) {
    patch.dimWeightKg = Number(row.dimWeightKg);
  }
  return patch;
}

function patchFieldDiffers(existing, patch, key, mode) {
  if (!Object.prototype.hasOwnProperty.call(patch, key)) return false;
  if (mode === "customer") return !sameCustomerLabel(existing[key], patch[key]);
  if (mode === "num") return normNum(existing[key]) !== normNum(patch[key]);
  if (mode === "upper") {
    return normStr(existing[key]).toUpperCase() !== normStr(patch[key]).toUpperCase();
  }
  return normStr(existing[key]) !== normStr(patch[key]);
}

/** So sánh lô web với dữ liệu Sheet — khác kho/khách/chuyến/… → cần cập nhật. */
export function sheetRowNeedsUpdate(existing, row, sessionDate, customers, lookupCustomerCode, lookupCustomerId) {
  if (!existing) return false;
  const patch = sheetRowToUpdatePatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId);

  if (
    isValidAwb(patch.awb) &&
    awbKeyForMatch(patch.awb) !== awbKeyForMatch(existing.awb)
  ) {
    return true;
  }

  if (patchFieldDiffers(existing, patch, "warehouse", "str")) return true;
  if (patchFieldDiffers(existing, patch, "customer", "customer")) return true;
  if (patchFieldDiffers(existing, patch, "flight", "upper")) return true;
  if (patchFieldDiffers(existing, patch, "flightDate", "upper")) return true;
  if (patchFieldDiffers(existing, patch, "cutoff", "str")) return true;
  if (patchFieldDiffers(existing, patch, "cutoffNote", "upper")) return true;
  if (patchFieldDiffers(existing, patch, "dest", "upper")) return true;
  if (patchFieldDiffers(existing, patch, "pcs", "num")) return true;
  if (patchFieldDiffers(existing, patch, "kg", "num")) return true;
  if (patchFieldDiffers(existing, patch, "dimWeightKg", "num")) return true;
  if (patchFieldDiffers(existing, patch, "note", "str")) return true;
  if (patchFieldDiffers(existing, patch, "shipperNamePrint", "str")) return true;
  if (patchFieldDiffers(existing, patch, "consigneeNamePrint", "str")) return true;
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

const SHEET_WAREHOUSE_ORDER = ["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"];

/** STT trên Sheet = thứ tự xuất hiện trong tab, tính riêng từng kho. */
export function assignSheetSttByWarehouse(parsed) {
  /** @type {Record<string, number>} */
  const c = {};
  return (parsed ?? []).map((row) => {
    const wh = String(row.warehouse || "TECS-TCS").trim() || "TECS-TCS";
    c[wh] = (c[wh] ?? 0) + 1;
    return { ...row, sheetStt: c[wh] };
  });
}

export function sheetOrderKeysByWarehouse(parsed) {
  /** @type {Map<string, string[]>} */
  const map = new Map(SHEET_WAREHOUSE_ORDER.map((wh) => [wh, []]));
  for (const row of parsed ?? []) {
    const key = awbKeyForMatch(row.awb);
    if (key.length < 11) continue;
    const wh = String(row.warehouse || "TECS-TCS").trim() || "TECS-TCS";
    if (!map.has(wh)) map.set(wh, []);
    const list = map.get(wh);
    if (!list.includes(key)) list.push(key);
  }
  return map;
}

/**
 * ID lô cùng phiên theo thứ tự Sheet (từng kho) — lô chỉ có trên web đứng sau.
 * @returns {string[]}
 */
export function orderedSessionIdsBySheet(rows, sessionDate, parsed) {
  const keysByWh = sheetOrderKeysByWarehouse(parsed);
  const session = (rows ?? []).filter((r) => r.sessionDate === sessionDate);
  /** @type {Map<string, object>} */
  const byAwb = new Map();
  for (const r of session) {
    const key = awbKeyForMatch(r.awb);
    if (key.length >= 11 && !byAwb.has(key)) byAwb.set(key, r);
  }
  const used = new Set();
  /** @type {string[]} */
  const ordered = [];
  for (const wh of [...SHEET_WAREHOUSE_ORDER, ...[...keysByWh.keys()].filter((w) => !SHEET_WAREHOUSE_ORDER.includes(w))]) {
    for (const key of keysByWh.get(wh) ?? []) {
      const lot = byAwb.get(key);
      if (!lot || used.has(lot.id)) continue;
      if (String(lot.warehouse || "") !== wh) continue;
      ordered.push(lot.id);
      used.add(lot.id);
    }
  }
  const rest = session
    .filter((r) => !used.has(r.id))
    .sort((a, b) => {
      const wa = SHEET_WAREHOUSE_ORDER.indexOf(a.warehouse);
      const wb = SHEET_WAREHOUSE_ORDER.indexOf(b.warehouse);
      if (wa !== wb) return (wa < 0 ? 99 : wa) - (wb < 0 ? 99 : wb);
      return (Number(a.stt) || 0) - (Number(b.stt) || 0);
    });
  for (const r of rest) ordered.push(r.id);
  return ordered;
}

/** Đặt lại thứ tự lô một phiên theo danh sách id — ngày khác giữ nguyên chỗ. */
export function applySessionIdOrder(rows, sessionDate, orderedIds) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const r of list) {
    if (r.sessionDate === sessionDate) byId.set(r.id, r);
  }
  const seen = new Set();
  /** @type {object[]} */
  const ordered = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r || seen.has(id)) continue;
    ordered.push(r);
    seen.add(id);
  }
  for (const r of list) {
    if (r.sessionDate !== sessionDate || seen.has(r.id)) continue;
    ordered.push(r);
    seen.add(r.id);
  }
  const out = [];
  let inserted = false;
  for (const r of list) {
    if (r.sessionDate !== sessionDate) {
      out.push(r);
      continue;
    }
    if (!inserted) {
      out.push(...ordered);
      inserted = true;
    }
  }
  if (!inserted) out.push(...ordered);
  return out;
}

export function countSessionSttShifts(rows, sessionDate, orderedIds) {
  const next = applySessionIdOrder(rows, sessionDate, orderedIds);
  /** @type {Map<string, number>} */
  const before = new Map();
  for (const r of rows ?? []) {
    if (r.sessionDate === sessionDate) before.set(r.id, Number(r.stt) || 0);
  }
  /** @type {Record<string, number>} */
  const c = {};
  let n = 0;
  for (const r of next) {
    if (r.sessionDate !== sessionDate) continue;
    const wh = String(r.warehouse || "TECS-TCS");
    c[wh] = (c[wh] ?? 0) + 1;
    if (before.get(r.id) !== c[wh]) n += 1;
  }
  return n;
}

/**
 * @returns {{ rows: object[], orderedIds: string[], changed: boolean, sttShiftCount: number }}
 */
export function reorderSessionRowsBySheet(rows, sessionDate, parsed) {
  const orderedIds = orderedSessionIdsBySheet(rows, sessionDate, parsed);
  const next = applySessionIdOrder(rows, sessionDate, orderedIds);
  const sttShiftCount = countSessionSttShifts(rows, sessionDate, orderedIds);
  const currentIds = (rows ?? []).filter((r) => r.sessionDate === sessionDate).map((r) => r.id);
  const changed =
    sttShiftCount > 0 ||
    currentIds.length !== orderedIds.length ||
    currentIds.some((id, i) => id !== orderedIds[i]);
  return { rows: next, orderedIds, changed, sttShiftCount };
}
