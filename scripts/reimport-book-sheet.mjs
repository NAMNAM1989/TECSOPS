/**
 * Xóa toàn bộ lô một phiên rồi nhập lại từ Google Sheet BOOK HẰNG NGÀY.
 * Dùng cùng Redis/file như server (loadEnv + setRedisStateClient).
 *
 * Usage: node scripts/reimport-book-sheet.mjs [YYYY-MM-DD]
 */
import { createClient } from "redis";
import "../server/loadEnv.mjs";
import {
  fetchGoogleSheetGrid,
  getBookSpreadsheetId,
  sessionYmdToBookSheetTab,
} from "../server/sheets/googleSheetFetch.mjs";
import { parseBookHangNgayGrid } from "../server/sheets/bookHangNgayParser.mjs";
import { filterRowsForSessionDate } from "../server/sheets/bookDateMatch.mjs";
import {
  findExistingInSession,
  sheetRowSyncStatus,
  sheetRowToPatch,
} from "../server/sheets/sheetRowReconcile.mjs";
import { loadState, runMutation, setRedisStateClient } from "../server/stateStore.mjs";

const sessionDate = process.argv[2] || "2026-06-13";
if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
  console.error("Sai định dạng ngày. Dùng YYYY-MM-DD.");
  process.exit(1);
}

const redisUrl = process.env.REDIS_URL?.trim();
/** @type {import('redis').RedisClientType | null} */
let redisClient = null;
if (redisUrl) {
  redisClient = createClient({ url: redisUrl });
  redisClient.on("error", (err) => console.error("[redis]", err.message));
  await redisClient.connect();
  setRedisStateClient(redisClient);
  console.log("[redis] đã kết nối state store");
}

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

function parsedRowToShipment(row, sd, customers) {
  const patch = sheetRowToPatch(row, sd, customers, lookupCustomerCode, lookupCustomerId);
  return {
    sessionDate: sd,
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

function countByWarehouse(rows) {
  const wh = {};
  for (const r of rows) wh[r.warehouse] = (wh[r.warehouse] || 0) + 1;
  return wh;
}

try {
  let state = await loadState();
  const before = state.rows.filter((r) => r.sessionDate === sessionDate);
  console.log(`Phiên ${sessionDate}: xóa ${before.length} lô`, countByWarehouse(before));

  for (const row of before) {
    state = await runMutation({ action: "DELETE", id: row.id });
  }
  console.log("Đã xóa xong.");

  const sheetTab = sessionYmdToBookSheetTab(sessionDate);
  const spreadsheetId = getBookSpreadsheetId();
  const grid = await fetchGoogleSheetGrid(spreadsheetId, sheetTab);
  const parsed = filterRowsForSessionDate(parseBookHangNgayGrid(grid, sessionDate), sessionDate);
  console.log(`Sheet tab ${sheetTab}: ${parsed.length} lô`, countByWarehouse(parsed));

  let applied = 0;
  let errors = 0;

  for (const row of parsed) {
    try {
      state = await runMutation({
        action: "ADD",
        shipment: parsedRowToShipment(row, sessionDate, state.customers ?? []),
      });
      applied++;
    } catch (e) {
      errors++;
      console.error("Lỗi", row.awb, e.message);
    }
  }

  const after = state.rows.filter((r) => r.sessionDate === sessionDate);
  let noCust = 0;
  for (const r of after) if (!r.customer) noCust++;

  console.log(`Web phiên ${sessionDate}: ${after.length} lô`, countByWarehouse(after));
  console.log(`Thiếu khách: ${noCust} · Ghi ${applied} lô · ${errors} lỗi`);
} finally {
  if (redisClient) await redisClient.quit();
}
