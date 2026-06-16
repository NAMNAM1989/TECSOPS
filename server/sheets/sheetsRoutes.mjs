import {
  fetchGoogleSheetGrid,
  getBookSpreadsheetId,
  sessionYmdToBookSheetTab,
} from "./googleSheetFetch.mjs";
import { parseBookHangNgayGrid } from "./bookHangNgayParser.mjs";
import { filterRowsForSessionDate, sessionYmdToFlightDateToken } from "./bookDateMatch.mjs";
import {
  awbKeyForMatch,
  findExistingInSession,
  findExistingOtherSession,
  resolveSheetRowSyncStatus,
  sheetAwbFirstIndexByKey,
  sheetRowIsBlocked,
  sheetRowToPatch,
} from "./sheetRowReconcile.mjs";
import { loadState, runMutation } from "../stateStore.mjs";

function lookupCustomerCode(customers, customerName) {
  const t = String(customerName ?? "").trim().toLowerCase();
  if (!t) return "";
  const hit = customers.find((e) => String(e.name ?? "").trim().toLowerCase() === t);
  return hit?.code?.trim() ?? "";
}

function lookupCustomerId(customers, customerName) {
  const t = String(customerName ?? "").trim().toLowerCase();
  if (!t) return "";
  const hit = customers.find((e) => String(e.name ?? "").trim().toLowerCase() === t);
  return hit?.id?.trim() ?? "";
}

function parsedRowToShipment(row, sessionDate, customers) {
  const patch = sheetRowToPatch(row, sessionDate, customers, lookupCustomerCode, lookupCustomerId);
  return {
    sessionDate,
    ...patch,
    hawb: "",
    dimWeightKg: null,
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
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    status: "PENDING",
  };
}

function mapSyncRow(row, index, sessionDate, sessionFlightDate, state, customers, awbFirstIndex) {
  const existing = findExistingInSession(state, sessionDate, row.awb);
  const otherSession = findExistingOtherSession(state, sessionDate, row.awb);
  const key = awbKeyForMatch(row.awb);
  const sheetFirstIndex = key ? (awbFirstIndex.get(key) ?? index) : index;
  const resolved = resolveSheetRowSyncStatus(
    { existing, otherSession, sheetFirstIndex, rowIndex: index },
    row,
    sessionDate,
    customers,
    lookupCustomerCode,
    lookupCustomerId
  );
  const { syncStatus, sheetDuplicateOfIndex, takenSessionDate } = resolved;
  const customerCode = lookupCustomerCode(customers, row.customer);
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
    customer: row.customer,
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
 * @param {{ io?: import('socket.io').Server, setEcargoStateSnapshot?: (s: object) => void }} deps
 */
export function registerSheetsRoutes(app, deps) {
  app.get("/api/sheets/book/config", (_req, res) => {
    res.json({
      spreadsheetId: getBookSpreadsheetId(),
      sheetTabExample: sessionYmdToBookSheetTab("2026-06-13"),
    });
  });

  app.get("/api/sheets/book/sync", async (req, res) => {
    try {
      const sessionDate = String(req.query.sessionDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu hoặc sai sessionDate (YYYY-MM-DD)." });
        return;
      }

      const sheetTab =
        String(req.query.sheetTab ?? "").trim() || sessionYmdToBookSheetTab(sessionDate);
      const spreadsheetId = String(req.query.spreadsheetId ?? "").trim() || getBookSpreadsheetId();

      const grid = await fetchGoogleSheetGrid(spreadsheetId, sheetTab);
      const parsed = parseBookHangNgayGrid(grid, sessionDate);
      const dated = filterRowsForSessionDate(parsed, sessionDate);
      const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
      const state = await loadState();
      const customers = Array.isArray(state.customers) ? state.customers : [];

      const awbFirstIndex = sheetAwbFirstIndexByKey(dated);
      const rows = dated.map((row, index) =>
        mapSyncRow(row, index, sessionDate, sessionFlightDate, state, customers, awbFirstIndex)
      );

      res.json({
        sessionDate,
        sessionFlightDate,
        sheetTab,
        spreadsheetId,
        syncedAt: new Date().toISOString(),
        totalInTab: parsed.length,
        skippedByDate: parsed.length - dated.length,
        total: rows.length,
        importable: rows.filter((r) => !r.blocked).length,
        newCount: rows.filter((r) => r.syncStatus === "new").length,
        updateCount: rows.filter((r) => r.syncStatus === "update").length,
        sheetDuplicateCount: rows.filter((r) => r.syncStatus === "sheet_duplicate").length,
        awbTakenCount: rows.filter((r) => r.syncStatus === "awb_taken").length,
        rows,
      });
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
      const sheetTab =
        String(body?.sheetTab ?? "").trim() || sessionYmdToBookSheetTab(sessionDate);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu sessionDate (YYYY-MM-DD)." });
        return;
      }
      if (!indices.length) {
        res.status(400).json({ error: "Chọn ít nhất một dòng để nhập." });
        return;
      }

      const spreadsheetId = String(body?.spreadsheetId ?? "").trim() || getBookSpreadsheetId();
      const grid = await fetchGoogleSheetGrid(spreadsheetId, sheetTab);
      const parsed = filterRowsForSessionDate(parseBookHangNgayGrid(grid, sessionDate), sessionDate);
      const pickSet = new Set(indices.filter((n) => Number.isInteger(n) && n >= 0));
      const selected = parsed.filter((_, i) => pickSet.has(i));

      if (!selected.length) {
        res.status(400).json({ error: "Không có dòng hợp lệ để nhập." });
        return;
      }

      let state = await loadState();
      const applied = [];
      const updated = [];
      const skipped = [];
      const errors = [];
      /** @type {Set<string>} */
      const batchAwbKeys = new Set();
      const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);

      for (const row of selected) {
        const parsedIndex = parsed.indexOf(row);
        const awbKey = awbKeyForMatch(row.awb);
        if (awbKey && batchAwbKeys.has(awbKey)) {
          skipped.push({ awb: row.awb, reason: "Trùng AWB trong lần chọn — chỉ nhập dòng đầu" });
          continue;
        }

        const existing = findExistingInSession(state, sessionDate, row.awb);
        const otherSession = findExistingOtherSession(state, sessionDate, row.awb);
        const sheetFirstIndex = awbFirstIndex.get(awbKey) ?? parsedIndex;
        const resolved = resolveSheetRowSyncStatus(
          { existing, otherSession, sheetFirstIndex, rowIndex: parsedIndex },
          row,
          sessionDate,
          state.customers ?? [],
          lookupCustomerCode,
          lookupCustomerId
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
              state.customers ?? [],
              lookupCustomerCode,
              lookupCustomerId
            );
            state = await runMutation({ action: "UPDATE", id: existing.id, patch });
            deps.setEcargoStateSnapshot?.(state);
            deps.io?.emit("sync", state);
            updated.push({
              awb: row.awb,
              warehouse: row.warehouse,
              fromWarehouse: existing.warehouse,
            });
            if (awbKey) batchAwbKeys.add(awbKey);
            continue;
          }

          const shipment = parsedRowToShipment(row, sessionDate, state.customers ?? []);
          state = await runMutation({ action: "ADD", shipment });
          deps.setEcargoStateSnapshot?.(state);
          deps.io?.emit("sync", state);
          applied.push({ awb: row.awb, warehouse: row.warehouse });
          if (awbKey) batchAwbKeys.add(awbKey);
        } catch (e) {
          errors.push({ awb: row.awb, error: String(e?.message ?? e) });
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
