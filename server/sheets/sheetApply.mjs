/**
 * Lõi khớp/áp dòng Sheet BOOK → lô Ops. Dùng chung cho `POST /api/sheets/book/apply`,
 * webhook Apps Script và auto-sync nền — chỉ một đường ghi (runBatchMutations + emitScopedSync).
 */

import { fetchBookHangNgayGridForSession, tabTitleMatchesSession } from "./googleSheetFetch.mjs";
import { getCachedGrid, getCachedGridForSession, setCachedGrid } from "./sheetFetchCache.mjs";
import { buildCustomerLookups, lookupCustomerCode, lookupCustomerId } from "./customerSheetLookup.mjs";
import {
  awbKeyForMatch,
  classifySheetOrphan,
  findOrphanSessionLots,
  reorderSessionRowsBySheet,
  resolveExistingForSheetRow,
  resolveSheetRowSyncStatus,
  sheetAwbFirstIndexByKey,
  sheetAwbKeySet,
  sheetRowIsBlocked,
  sheetRowToPatch,
  sheetRowToUpdatePatch,
} from "./sheetRowReconcile.mjs";
import { loadState, runBatchMutations } from "../stateStore.mjs";
import { attachDbSyncedAt } from "../namnamlogisticsSyncedAt.mjs";
import { emitScopedSync } from "../stateScope.mjs";

export function buildAwbIndexes(rows, sessionDate) {
  /** @type {Map<string, object>} */
  const inSession = new Map();
  /** @type {Map<string, object>} */
  const otherSession = new Map();
  for (const r of rows) {
    const key = awbKeyForMatch(r.awb);
    if (!key || key.length < 11) continue;
    if (r.sessionDate === sessionDate) {
      if (!inSession.has(key)) inSession.set(key, r);
    } else if (!otherSession.has(key)) {
      otherSession.set(key, r);
    }
  }
  return { inSession, otherSession };
}

export function findExistingOtherSessionIndexed(indexes, awb) {
  const key = awbKeyForMatch(awb);
  if (key.length < 11) return null;
  return indexes.otherSession.get(key) ?? null;
}

export async function loadBookGridForSession(
  spreadsheetId,
  sessionDate,
  preferredTab,
  forceRefresh = false,
  preferredGid = ""
) {
  const preferred = String(preferredTab ?? "").trim();
  const gid = String(preferredGid ?? "").trim();
  if (String(spreadsheetId || "").startsWith("local:")) {
    const cachedSession = getCachedGridForSession(spreadsheetId, sessionDate);
    if (cachedSession?.grid?.length) {
      return {
        grid: cachedSession.grid,
        sheetTab: cachedSession.sheetTab || preferred || "local",
        gid: "",
      };
    }
    if (preferred) {
      const cached = getCachedGrid(spreadsheetId, sessionDate, preferred);
      if (cached?.grid?.length) {
        return { grid: cached.grid, sheetTab: cached.sheetTab, gid: "" };
      }
    }
    throw new Error("Chưa có dữ liệu file local — hãy kéo thả / tải file lại trước khi nhập.");
  }
  if (!forceRefresh && !gid) {
    const cachedSession = getCachedGridForSession(spreadsheetId, sessionDate);
    if (
      cachedSession?.grid?.length &&
      tabTitleMatchesSession(cachedSession.sheetTab, sessionDate)
    ) {
      return { grid: cachedSession.grid, sheetTab: cachedSession.sheetTab, gid: "" };
    }
    if (preferred) {
      const cached = getCachedGrid(spreadsheetId, sessionDate, preferred);
      if (cached?.grid?.length) {
        return { grid: cached.grid, sheetTab: cached.sheetTab, gid: "" };
      }
    }
  }

  const { grid, sheetTab, gid: resolvedGid } = await fetchBookHangNgayGridForSession(
    spreadsheetId,
    sessionDate,
    preferredTab,
    { preferredGid: gid }
  );
  setCachedGrid(spreadsheetId, sessionDate, sheetTab, grid, {
    bindSession: tabTitleMatchesSession(sheetTab, sessionDate),
  });
  return { grid, sheetTab, gid: resolvedGid };
}

export function parsedRowToShipment(row, sessionDate, customers) {
  const patch = sheetRowToPatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId);
  return {
    sessionDate,
    ...patch,
    hawb: "",
    dimWeightKg: row.dimWeightKg ?? null,
    dimLines: null,
    dimDivisor: null,
    globalAgentId: "",
    customerShipperId: "",
    customerConsigneeId: "",
    customerGoodsId: "",
    goodsDescriptionPrint: "",
    otherRequirementsPrint: "",
    shipperNamePrint: row.shipperNamePrint || "",
    shipperAddressPrint: "",
    shipperPhonePrint: "",
    shipperEmailPrint: "",
    taxCodePrint: "",
    agentNamePrint: "",
    agentAddressPrint: "",
    agentPhonePrint: "",
    agentEmailPrint: "",
    agentTaxCodePrint: "",
    consigneeNamePrint: row.consigneeNamePrint || "",
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    status: "PENDING",
  };
}

let applyChain = Promise.resolve();

/**
 * Tuần tự hoá đọc-tính-ghi Sheet (apply tay, webhook, auto-sync) trong process —
 * khoá Postgres chỉ bao phần ghi, không bao bước loadState → tính mutation.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withSheetApplyLock(fn) {
  const run = applyChain.then(() => fn());
  applyChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * @typedef {{ awb: string, reason: string, code: string, sheetRowIndex: number | null }} SheetApplySkip
 */

/** Trùng AWB «trong lần chọn» chỉ xảy ra khi hai dòng Sheet cùng AWB — báo như trùng Sheet. */
export function sheetSkipCode(code) {
  return code === "batch_duplicate" ? "sheet_duplicate" : code;
}

/**
 * Khớp các dòng `parsed[indices]` với state rồi ghi một batch + broadcast một lần.
 * @param {{
 *   parsed: object[],
 *   indices: number[],
 *   sessionDate: string,
 *   removeIds?: string[],
 *   wantReorder?: boolean,
 *   io?: import('socket.io').Server,
 * }} input
 */
export function applyParsedSheetRows(input) {
  return withSheetApplyLock(() => applyParsedSheetRowsUnlocked(input));
}

async function applyParsedSheetRowsUnlocked({
  parsed,
  indices,
  sessionDate,
  removeIds = [],
  wantReorder = true,
  io,
}) {
  const pickSet = new Set(indices.filter((n) => Number.isInteger(n) && n >= 0));
  const selected = parsed.filter((_, i) => pickSet.has(i));

  let state = await loadState();
  const customerLookups = buildCustomerLookups(state.customers ?? []);
  const awbIndexes = buildAwbIndexes(state.rows, sessionDate);
  const applied = [];
  const updated = [];
  const removed = [];
  /** @type {SheetApplySkip[]} */
  const skipped = [];
  const errors = [];
  /** @type {Set<string>} */
  const batchAwbKeys = new Set();
  /** @type {Set<string>} */
  const claimedBlankBookingIds = new Set();
  const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);
  const sheetAwbKeys = sheetAwbKeySet(parsed);
  /** @type {object[]} */
  const pendingMutations = [];

  const skip = (row, code, reason) => {
    skipped.push({ awb: row.awb, reason, code, sheetRowIndex: row.sheetRowIndex ?? null });
  };

  for (const row of selected) {
    const parsedIndex = parsed.indexOf(row);
    const awbKey = awbKeyForMatch(row.awb);
    if (awbKey && batchAwbKeys.has(awbKey)) {
      skip(row, "batch_duplicate", "Trùng AWB trong lần chọn — chỉ nhập dòng đầu");
      continue;
    }

    const existing = resolveExistingForSheetRow(
      state.rows,
      awbIndexes,
      sessionDate,
      row,
      claimedBlankBookingIds,
      sheetAwbKeys
    );
    const otherSession = findExistingOtherSessionIndexed(awbIndexes, row.awb);
    const sheetFirstIndex = awbFirstIndex.get(awbKey) ?? parsedIndex;
    const resolved = resolveSheetRowSyncStatus(
      { existing, otherSession, sheetFirstIndex, rowIndex: parsedIndex },
      row,
      sessionDate,
      [],
      customerLookups.code,
      customerLookups.id
    );
    const syncStatus = resolved.syncStatus;

    if (sheetRowIsBlocked(syncStatus)) {
      if (syncStatus === "duplicate") {
        skip(row, "unchanged", "Đã khớp Sheet — không đổi");
      } else if (syncStatus === "sheet_duplicate") {
        skip(row, "sheet_duplicate", "Trùng AWB trong Sheet — bỏ dòng sau");
      } else if (syncStatus === "awb_taken") {
        skip(row, "awb_taken", `AWB đã có phiên ${resolved.takenSessionDate ?? "khác"}`);
      }
      continue;
    }

    try {
      if (syncStatus === "update" && existing) {
        const patch = sheetRowToUpdatePatch(
          row,
          sessionDate,
          [],
          customerLookups.code,
          customerLookups.id
        );
        if (!Object.keys(patch).length) {
          skip(row, "no_patch", "Sheet không có field mới để cập nhật");
          continue;
        }
        pendingMutations.push({ action: "UPDATE", id: existing.id, patch });
        updated.push({
          awb: row.awb,
          warehouse: row.warehouse,
          fromWarehouse: existing.warehouse,
        });
        if (awbKey) batchAwbKeys.add(awbKey);
        claimedBlankBookingIds.add(existing.id);
        continue;
      }

      const shipment = parsedRowToShipment(row, sessionDate, state.customers ?? []);
      pendingMutations.push({ action: "ADD", shipment });
      applied.push({ awb: row.awb, warehouse: row.warehouse });
      if (awbKey) batchAwbKeys.add(awbKey);
    } catch (e) {
      errors.push({ awb: row.awb, error: String(e?.message ?? e) });
    }
  }

  if (removeIds.length) {
    const orphans = findOrphanSessionLots(state.rows, sessionDate, parsed, claimedBlankBookingIds);
    const orphanById = new Map(orphans.map((o) => [o.id, o]));
    for (const id of removeIds) {
      const orphan = orphanById.get(id);
      if (!orphan) {
        skipped.push({
          awb: id,
          reason: "Không phải lô thừa của tab Sheet này",
          code: "not_orphan",
          sheetRowIndex: null,
        });
        continue;
      }
      pendingMutations.push({ action: "DELETE", id: orphan.id });
      removed.push({
        awb: orphan.awb,
        warehouse: orphan.warehouse,
        replacedByAwb: classifySheetOrphan(orphan, parsed, sessionDate).replacedByAwb,
      });
    }
  }

  if (pendingMutations.length) {
    state = await runBatchMutations(pendingMutations);
  }

  let reorderedCount = 0;
  if (wantReorder) {
    const plan = reorderSessionRowsBySheet(state.rows, sessionDate, parsed);
    if (plan.changed && plan.orderedIds.length) {
      state = await runBatchMutations([
        { action: "REORDER_SESSION", sessionDate, orderedIds: plan.orderedIds },
      ]);
      reorderedCount = plan.sttShiftCount;
    }
  }

  const mutated = pendingMutations.length > 0 || reorderedCount > 0;
  if (mutated) {
    const forClient = await attachDbSyncedAt(state);
    if (io) await emitScopedSync(io, forClient, { omitCustomers: true });
    state = forClient;
  }

  return { state, applied, updated, removed, skipped, errors, reorderedCount, mutated };
}
