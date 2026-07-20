import {
  fetchBookHangNgayGridForSession,
  getBookSpreadsheetId,
  sessionYmdToBookSheetTab,
} from "./googleSheetFetch.mjs";
import { getCachedGrid, getCachedGridForSession, getCachedSyncResult, setCachedGrid, setCachedSyncResult, syncResultCacheKey } from "./sheetFetchCache.mjs";
import { parseBookHangNgayGrid } from "./bookHangNgayParser.mjs";
import { sessionYmdToFlightDateToken } from "./bookDateMatch.mjs";
import {
  buildCustomerLookups,
  lookupCustomerCode,
  lookupCustomerId,
} from "./customerSheetLookup.mjs";
import {
  awbKeyForMatch,
  resolveExistingForSheetRow,
  resolveSheetRowSyncStatus,
  sheetAwbFirstIndexByKey,
  sheetRowIsBlocked,
  sheetRowToPatch,
} from "./sheetRowReconcile.mjs";
import { loadState, peekStateVersion, runBatchMutations } from "../stateStore.mjs";

function buildAwbIndexes(rows, sessionDate) {
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

function findExistingOtherSessionIndexed(indexes, awb) {
  const key = awbKeyForMatch(awb);
  if (key.length < 11) return null;
  return indexes.otherSession.get(key) ?? null;
}

async function loadBookGridForSession(spreadsheetId, sessionDate, preferredTab, forceRefresh = false) {
  const preferred = String(preferredTab ?? "").trim();
  if (!forceRefresh) {
    const cachedSession = getCachedGridForSession(spreadsheetId, sessionDate);
    if (cachedSession?.grid?.length) {
      return { grid: cachedSession.grid, sheetTab: cachedSession.sheetTab, gid: "" };
    }
    if (preferred) {
      const cached = getCachedGrid(spreadsheetId, sessionDate, preferred);
      if (cached?.grid?.length) {
        return { grid: cached.grid, sheetTab: cached.sheetTab, gid: "" };
      }
    }
  }

  const { grid, sheetTab, gid } = await fetchBookHangNgayGridForSession(
    spreadsheetId,
    sessionDate,
    preferredTab
  );
  setCachedGrid(spreadsheetId, sessionDate, sheetTab, grid);
  return { grid, sheetTab, gid };
}

function parsedRowToShipment(row, sessionDate, customers) {
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
    shipperNamePrint: "",
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

function mapSyncRow(
  row,
  index,
  sessionDate,
  sessionFlightDate,
  awbIndexes,
  customerLookups,
  awbFirstIndex,
  sessionRows
) {
  const existing = resolveExistingForSheetRow(sessionRows, awbIndexes, sessionDate, row);
  const otherSession = findExistingOtherSessionIndexed(awbIndexes, row.awb);
  const key = awbKeyForMatch(row.awb);
  const sheetFirstIndex = key ? (awbFirstIndex.get(key) ?? index) : index;
  const resolved = resolveSheetRowSyncStatus(
    { existing, otherSession, sheetFirstIndex, rowIndex: index },
    row,
    sessionDate,
    [],
    customerLookups.code,
    customerLookups.id
  );
  const { syncStatus, sheetDuplicateOfIndex, takenSessionDate } = resolved;
  const customerCode = customerLookups.code(row.customer);
  return {
    index,
    sheetRowIndex: row.sheetRowIndex,
    blockTitle: row.blockTitle,
    awb: row.awb,
    flight: row.flight,
    flightDate: row.flightDate || sessionFlightDate,
    cutoff: row.cutoff,
    cutoffNote: row.cutoffNote,
    dest: row.dest,
    warehouse: row.warehouse,
    pcs: row.pcs,
    kg: row.kg,
    dimWeightKg: row.dimWeightKg ?? null,
    customer: row.customer,
    note: row.note,
    customerCode,
    customerKnown: Boolean(customerCode),
    consigneePreview: row.consigneeNamePrint.slice(0, 120),
    syncStatus,
    duplicate: syncStatus === "duplicate",
    needsUpdate: syncStatus === "update",
    blocked: sheetRowIsBlocked(syncStatus),
    sheetDuplicateOfIndex,
    takenSessionDate,
    existingWarehouse: existing?.warehouse ?? null,
    duplicateId: existing?.id ?? null,
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ io?: import('socket.io').Server }} deps
 */
export function registerSheetsRoutes(app, deps) {
  app.get("/api/sheets/book/config", (_req, res) => {
    res.json({
      spreadsheetId: getBookSpreadsheetId(),
      sheetTabExample: sessionYmdToBookSheetTab("2026-07-13"),
    });
  });

  app.get("/api/sheets/book/sync", async (req, res) => {
    try {
      const sessionDate = String(req.query.sessionDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu hoặc sai sessionDate (YYYY-MM-DD)." });
        return;
      }

      const preferredTab = String(req.query.sheetTab ?? "").trim();
      const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
      const spreadsheetId = String(req.query.spreadsheetId ?? "").trim() || getBookSpreadsheetId();

      if (!forceRefresh) {
        try {
          const stateVersion = await peekStateVersion();
          const syncKey = syncResultCacheKey(spreadsheetId, sessionDate, stateVersion);
          const cachedSync = getCachedSyncResult(syncKey);
          if (cachedSync) {
            res.json(cachedSync);
            return;
          }
        } catch {
          // peekVersion thất bại — tiếp tục sync đầy đủ
        }
      }

      const { grid, sheetTab } = await loadBookGridForSession(
        spreadsheetId,
        sessionDate,
        preferredTab,
        forceRefresh
      );
      // Ngày phiên = ngày tab đã resolve — giữ mọi dòng trên tab (không lọc cutoff).
      const parsed = parseBookHangNgayGrid(grid, sessionDate);
      const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
      const state = await loadState();
      const customers = Array.isArray(state.customers) ? state.customers : [];
      const customerLookups = buildCustomerLookups(customers);
      const awbIndexes = buildAwbIndexes(state.rows, sessionDate);

      const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);
      const rows = parsed.map((row, index) =>
        mapSyncRow(
          row,
          index,
          sessionDate,
          sessionFlightDate,
          awbIndexes,
          customerLookups,
          awbFirstIndex,
          state.rows
        )
      );

      const payload = {
        sessionDate,
        sessionFlightDate,
        sheetTab,
        spreadsheetId,
        syncedAt: new Date().toISOString(),
        totalInTab: parsed.length,
        skippedByDate: 0,
        total: rows.length,
        importable: rows.filter((r) => !r.blocked).length,
        newCount: rows.filter((r) => r.syncStatus === "new").length,
        updateCount: rows.filter((r) => r.syncStatus === "update").length,
        sheetDuplicateCount: rows.filter((r) => r.syncStatus === "sheet_duplicate").length,
        awbTakenCount: rows.filter((r) => r.syncStatus === "awb_taken").length,
        rows,
      };

      setCachedSyncResult(syncResultCacheKey(spreadsheetId, sessionDate, state.version), payload);
      res.json(payload);
    } catch (e) {
      console.error("[api/sheets/book/sync]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  app.post("/api/sheets/book/apply", async (req, res) => {
    try {
      const body = req.body;
      const sessionDate = String(body?.sessionDate ?? "").trim();
      const indices = Array.isArray(body?.indices) ? body.indices.map(Number) : [];
      const preferredTab = String(body?.sheetTab ?? "").trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu sessionDate (YYYY-MM-DD)." });
        return;
      }
      if (!indices.length) {
        res.status(400).json({ error: "Chọn ít nhất một dòng để nhập." });
        return;
      }

      const spreadsheetId = String(body?.spreadsheetId ?? "").trim() || getBookSpreadsheetId();
      const { grid } = await loadBookGridForSession(
        spreadsheetId,
        sessionDate,
        preferredTab
      );
      const parsed = parseBookHangNgayGrid(grid, sessionDate);
      const pickSet = new Set(indices.filter((n) => Number.isInteger(n) && n >= 0));
      const selected = parsed.filter((_, i) => pickSet.has(i));

      if (!selected.length) {
        res.status(400).json({ error: "Không có dòng hợp lệ để nhập." });
        return;
      }

      let state = await loadState();
      const customerLookups = buildCustomerLookups(state.customers ?? []);
      const awbIndexes = buildAwbIndexes(state.rows, sessionDate);
      const applied = [];
      const updated = [];
      const skipped = [];
      const errors = [];
      /** @type {Set<string>} */
      const batchAwbKeys = new Set();
      /** @type {Set<string>} */
      const claimedBlankBookingIds = new Set();
      const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);
      /** @type {object[]} */
      const pendingMutations = [];

      for (const row of selected) {
        const parsedIndex = parsed.indexOf(row);
        const awbKey = awbKeyForMatch(row.awb);
        if (awbKey && batchAwbKeys.has(awbKey)) {
          skipped.push({ awb: row.awb, reason: "Trùng AWB trong lần chọn — chỉ nhập dòng đầu" });
          continue;
        }

        const existing = resolveExistingForSheetRow(
          state.rows,
          awbIndexes,
          sessionDate,
          row,
          claimedBlankBookingIds
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
            skipped.push({ awb: row.awb, reason: "Đã khớp Sheet — không đổi" });
          } else if (syncStatus === "sheet_duplicate") {
            skipped.push({ awb: row.awb, reason: "Trùng AWB trong Sheet — bỏ dòng sau" });
          } else if (syncStatus === "awb_taken") {
            skipped.push({
              awb: row.awb,
              reason: `AWB đã có phiên ${resolved.takenSessionDate ?? "khác"}`,
            });
          }
          continue;
        }

        try {
          if (syncStatus === "update" && existing) {
            const patch = sheetRowToPatch(
              row,
              sessionDate,
              [],
              customerLookups.code,
              customerLookups.id
            );
            pendingMutations.push({ action: "UPDATE", id: existing.id, patch });
            updated.push({
              awb: row.awb,
              warehouse: row.warehouse,
              fromWarehouse: existing.warehouse,
            });
            if (awbKey) batchAwbKeys.add(awbKey);
            if (!awbKeyForMatch(existing.awb)) claimedBlankBookingIds.add(existing.id);
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

      if (pendingMutations.length) {
        try {
          state = await runBatchMutations(pendingMutations);
          deps.io?.emit("sync", state);
        } catch (e) {
          res.status(500).json({ error: String(e?.message ?? e) });
          return;
        }
      }

      res.json({
        sessionDate,
        appliedCount: applied.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        applied,
        updated,
        skipped,
        errors,
        state,
      });
    } catch (e) {
      console.error("[api/sheets/book/apply]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });
}
