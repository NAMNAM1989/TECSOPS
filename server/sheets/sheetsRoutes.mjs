import {
  getBookSpreadsheetId,
  getBookSpreadsheetShareUrl,
  sessionYmdToBookSheetTab,
  tabTitleMatchesSession,
} from "./googleSheetFetch.mjs";
import { parseSpreadsheetIdFromInput, parseSheetGidFromInput } from "./spreadsheetIdParse.mjs";
import { getCachedSyncResult, setCachedGrid, setCachedSyncResult, syncResultCacheKey } from "./sheetFetchCache.mjs";
import { parseBookHangNgayGrid } from "./bookHangNgayParser.mjs";
import { sessionYmdToFlightDateToken } from "./bookDateMatch.mjs";
import { buildCustomerLookups } from "./customerSheetLookup.mjs";
import {
  awbKeyForMatch,
  assignSheetSttByWarehouse,
  classifySheetOrphan,
  findOrphanSessionLots,
  resolveExistingForSheetRow,
  resolveSheetRowSyncStatus,
  sheetAwbFirstIndexByKey,
  sheetAwbKeySet,
  sheetRowIsBlocked,
} from "./sheetRowReconcile.mjs";
import {
  applyParsedSheetRows,
  buildAwbIndexes,
  findExistingOtherSessionIndexed,
  loadBookGridForSession,
} from "./sheetApply.mjs";
import { registerSheetWebhookRoutes } from "./sheetWebhook.mjs";
import { loadState, peekStateVersion } from "../stateStore.mjs";
import { projectAppState } from "../stateScope.mjs";

function mapOrphanRow(orphan, sheetRows, sessionDate) {
  const classified = classifySheetOrphan(orphan, sheetRows, sessionDate);
  return {
    id: orphan.id,
    awb: orphan.awb,
    warehouse: orphan.warehouse,
    customer: orphan.customer,
    flight: orphan.flight,
    flightDate: orphan.flightDate,
    dest: orphan.dest,
    pcs: orphan.pcs ?? null,
    kg: orphan.kg ?? null,
    status: orphan.status ?? "PENDING",
    kind: classified.kind,
    replacedByAwb: classified.replacedByAwb,
    autoRemove: classified.autoRemove,
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
  sessionRows,
  claimedIds = null,
  sheetAwbKeys = null
) {
  const existing = resolveExistingForSheetRow(
    sessionRows,
    awbIndexes,
    sessionDate,
    row,
    claimedIds,
    sheetAwbKeys
  );
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
    shipperPreview: String(row.shipperNamePrint || "").slice(0, 120),
    consigneePreview: String(row.consigneeNamePrint || "").slice(0, 120),
    syncStatus,
    duplicate: syncStatus === "duplicate",
    needsUpdate: syncStatus === "update",
    blocked: sheetRowIsBlocked(syncStatus),
    sheetDuplicateOfIndex,
    takenSessionDate,
    existingWarehouse: existing?.warehouse ?? null,
    existingStt: existing?.stt ?? null,
    sheetStt: row.sheetStt ?? null,
    duplicateId: existing?.id ?? null,
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ io?: import('socket.io').Server }} deps
 */
function resolveSheetLinkFromRequest(raw, explicitGid = "") {
  const s = String(raw ?? "").trim();
  const gid = String(explicitGid ?? "").trim();
  if (!s) {
    return { spreadsheetId: getBookSpreadsheetId(), sheetGid: gid };
  }
  if (s.startsWith("local:")) {
    return { spreadsheetId: s, sheetGid: gid };
  }
  return {
    spreadsheetId: parseSpreadsheetIdFromInput(s),
    sheetGid: gid || parseSheetGidFromInput(s),
  };
}

/** CSV/TSV → grid 2D (giống Google Sheet cells). */
function csvTextToGrid(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);
  const delim =
    lines.slice(0, 5).some((l) => (l.match(/\t/g) || []).length >= 2) ? "\t" : ",";
  /** @type {string[][]} */
  const grid = [];
  for (const line of lines) {
    if (!line.trim()) {
      grid.push([]);
      continue;
    }
    if (delim === "\t") {
      grid.push(line.split("\t").map((c) => c.trim()));
      continue;
    }
    // CSV đơn giản — hỗ trợ quoted field.
    const row = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQ = !inQ;
        }
        continue;
      }
      if (ch === "," && !inQ) {
        row.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    row.push(cur.trim());
    grid.push(row);
  }
  while (grid.length && grid[grid.length - 1].every((c) => !c)) grid.pop();
  return grid;
}

export function registerSheetsRoutes(app, deps) {
  const requireAuth = deps.requireAuth || ((_req, _res, next) => next());
  registerSheetWebhookRoutes(app, { io: deps.io, requireAuth });

  app.get("/api/sheets/book/config", requireAuth, (_req, res) => {
    const spreadsheetId = getBookSpreadsheetId();
    res.json({
      spreadsheetId,
      shareUrl: getBookSpreadsheetShareUrl(spreadsheetId),
      sheetTabExample: sessionYmdToBookSheetTab("2026-07-13"),
      hints: [
        "Sheet phải bật share: Anyone with the link can view",
        "Tab theo ngày phiên Ops: «NGÀY 13 JUL» cho 2026-07-13",
        "Dán URL rồi bấm «Tải dòng»",
      ],
    });
  });

  app.get("/api/sheets/book/sync", requireAuth, async (req, res) => {
    try {
      const sessionDate = String(req.query.sessionDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu hoặc sai sessionDate (YYYY-MM-DD)." });
        return;
      }

      const preferredTab = String(req.query.sheetTab ?? "").trim();
      const forceRefresh = req.query.refresh === "1" || req.query.refresh === "true";
      let spreadsheetId;
      let sheetGid;
      try {
        ({ spreadsheetId, sheetGid } = resolveSheetLinkFromRequest(
          req.query.spreadsheetId,
          req.query.gid ?? req.query.sheetGid
        ));
      } catch (e) {
        res.status(400).json({ error: String(e?.message ?? e) });
        return;
      }

      if (!forceRefresh && !sheetGid) {
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
        forceRefresh,
        sheetGid
      );
      // Ngày phiên = ngày tab đã resolve — giữ mọi dòng trên tab (không lọc cutoff).
      const parsed = assignSheetSttByWarehouse(parseBookHangNgayGrid(grid, sessionDate));
      const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
      let expectedSheetTab = "";
      try {
        expectedSheetTab = sessionYmdToBookSheetTab(sessionDate);
      } catch {
        expectedSheetTab = "";
      }
      const sheetTabMismatch = Boolean(
        sheetTab && !tabTitleMatchesSession(sheetTab, sessionDate)
      );
      const state = await loadState();
      const customers = Array.isArray(state.customers) ? state.customers : [];
      const customerLookups = buildCustomerLookups(customers);
      const awbIndexes = buildAwbIndexes(state.rows, sessionDate);

      const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);
      const sheetAwbKeys = sheetAwbKeySet(parsed);
      /** @type {Set<string>} */
      const claimedIds = new Set();
      const rows = parsed.map((row, index) => {
        const mapped = mapSyncRow(
          row,
          index,
          sessionDate,
          sessionFlightDate,
          awbIndexes,
          customerLookups,
          awbFirstIndex,
          state.rows,
          claimedIds,
          sheetAwbKeys
        );
        if (mapped.duplicateId) claimedIds.add(mapped.duplicateId);
        return mapped;
      });
      const orphans = findOrphanSessionLots(state.rows, sessionDate, parsed, claimedIds).map(
        (orphan) => mapOrphanRow(orphan, parsed, sessionDate)
      );

      const payload = {
        sessionDate,
        sessionFlightDate,
        sheetTab,
        expectedSheetTab: expectedSheetTab || undefined,
        sheetTabMismatch,
        sheetGid: sheetGid || undefined,
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
        orphanCount: orphans.length,
        autoRemoveOrphanCount: orphans.filter((o) => o.autoRemove).length,
        orphans,
        rows,
      };

      setCachedSyncResult(syncResultCacheKey(spreadsheetId, sessionDate, state.version), payload);
      res.json(payload);
    } catch (e) {
      console.error("[api/sheets/book/sync]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  /** Sync từ CSV/TSV local (kéo-thả file) — cùng schema preview với Google Sheet. */
  app.post("/api/sheets/book/sync-local", requireAuth, async (req, res) => {
    try {
      const sessionDate = String(req.body?.sessionDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu hoặc sai sessionDate (YYYY-MM-DD)." });
        return;
      }
      const fileName = String(req.body?.fileName ?? "upload.csv").trim() || "upload.csv";
      const text = String(req.body?.csvText ?? "");
      if (!text.trim()) {
        res.status(400).json({ error: "File trống hoặc không đọc được nội dung." });
        return;
      }
      if (text.length > 8_000_000) {
        res.status(400).json({ error: "File quá lớn (tối đa ~8MB)." });
        return;
      }
      const grid = csvTextToGrid(text);
      if (!grid.length) {
        res.status(400).json({ error: "Không parse được dòng nào từ file." });
        return;
      }
      const spreadsheetId = `local:${sessionDate}`;
      const sheetTab = fileName.slice(0, 80);
      setCachedGrid(spreadsheetId, sessionDate, sheetTab, grid, { bindSession: true });

      const parsed = assignSheetSttByWarehouse(parseBookHangNgayGrid(grid, sessionDate));
      const sessionFlightDate = sessionYmdToFlightDateToken(sessionDate);
      const state = await loadState();
      const customers = Array.isArray(state.customers) ? state.customers : [];
      const customerLookups = buildCustomerLookups(customers);
      const awbIndexes = buildAwbIndexes(state.rows, sessionDate);
      const awbFirstIndex = sheetAwbFirstIndexByKey(parsed);
      const sheetAwbKeys = sheetAwbKeySet(parsed);
      /** @type {Set<string>} */
      const claimedIds = new Set();
      const rows = parsed.map((row, index) => {
        const mapped = mapSyncRow(
          row,
          index,
          sessionDate,
          sessionFlightDate,
          awbIndexes,
          customerLookups,
          awbFirstIndex,
          state.rows,
          claimedIds,
          sheetAwbKeys
        );
        if (mapped.duplicateId) claimedIds.add(mapped.duplicateId);
        return mapped;
      });
      const orphans = findOrphanSessionLots(state.rows, sessionDate, parsed, claimedIds).map(
        (orphan) => mapOrphanRow(orphan, parsed, sessionDate)
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
        orphanCount: orphans.length,
        autoRemoveOrphanCount: orphans.filter((o) => o.autoRemove).length,
        orphans,
        source: "local-file",
        fileName,
        rows,
        headerPreview: (grid[0] || []).slice(0, 16).map((c) => String(c ?? "")),
      };
      setCachedSyncResult(syncResultCacheKey(spreadsheetId, sessionDate, state.version), payload);
      res.json(payload);
    } catch (e) {
      console.error("[api/sheets/book/sync-local]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });

  app.post("/api/sheets/book/apply", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const sessionDate = String(body?.sessionDate ?? "").trim();
      const indices = Array.isArray(body?.indices) ? body.indices.map(Number) : [];
      const removeIds = Array.isArray(body?.removeIds)
        ? body.removeIds.map((id) => String(id ?? "").trim()).filter(Boolean)
        : [];
      const preferredTab = String(body?.sheetTab ?? "").trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        res.status(400).json({ error: "Thiếu sessionDate (YYYY-MM-DD)." });
        return;
      }
      const wantReorder = body?.reorder !== false;

      let spreadsheetId;
      let sheetGid;
      try {
        ({ spreadsheetId, sheetGid } = resolveSheetLinkFromRequest(
          body?.spreadsheetId,
          body?.gid ?? body?.sheetGid
        ));
      } catch (e) {
        res.status(400).json({ error: String(e?.message ?? e) });
        return;
      }
      const { grid } = await loadBookGridForSession(
        spreadsheetId,
        sessionDate,
        preferredTab,
        false,
        sheetGid
      );
      const parsed = assignSheetSttByWarehouse(parseBookHangNgayGrid(grid, sessionDate));
      const validIndices = indices.filter((n) => Number.isInteger(n) && n >= 0 && n < parsed.length);

      if (!validIndices.length && !removeIds.length && !wantReorder) {
        res.status(400).json({ error: "Không có dòng hợp lệ để nhập." });
        return;
      }

      const result = await applyParsedSheetRows({
        parsed,
        indices: validIndices,
        sessionDate,
        removeIds,
        wantReorder,
        io: deps.io,
      });
      const { state, applied, updated, removed, errors, reorderedCount } = result;
      const skipped = result.skipped.map(({ awb, reason }) => ({ awb, reason }));

      res.json({
        sessionDate,
        appliedCount: applied.length,
        updatedCount: updated.length,
        removedCount: removed.length,
        reorderedCount,
        skippedCount: skipped.length,
        errorCount: errors.length,
        applied,
        updated,
        removed,
        skipped,
        errors,
        state: projectAppState(state, { sessionDate }),
      });
    } catch (e) {
      console.error("[api/sheets/book/apply]", e);
      res.status(500).json({ error: String(e?.message ?? e) });
    }
  });
}
