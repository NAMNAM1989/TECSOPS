/**
 * So sánh: số lô trong ngày (API) = prepareDayReportRows = số dòng dữ liệu Excel (không tính header).
 * Chạy: npx tsx scripts/verify-day-excel-count.mts [YYYY-MM-DD]
 * Mặc định API: http://127.0.0.1:3001/api/state
 */
import { buildDayReportWorkbook, prepareDayReportRows } from "../src/utils/exportDayReportExcel.ts";

const API = process.env.VERIFY_API_URL ?? "http://127.0.0.1:3001/api/state";
const ymd = process.argv[2] ?? "2026-04-07";

const res = await fetch(API);
if (!res.ok) throw new Error(`API ${res.status}`);
const { rows } = (await res.json()) as { rows: { sessionDate: string }[] };

const dayRows = rows.filter((r) => (r.sessionDate || "").trim() === ymd);
const prepared = prepareDayReportRows(rows, ymd);
const wb = await buildDayReportWorkbook(rows, ymd);
const sheet = wb.worksheets[0];
const excelDataRows = Math.max(0, sheet.rowCount - 1);

const out = {
  apiUrl: API,
  sessionDate: ymd,
  dayRows_viewRows_equivalent: dayRows.length,
  prepareDayReportRows: prepared.length,
  excel_body_rows: excelDataRows,
  allMatch: dayRows.length === prepared.length && prepared.length === excelDataRows,
};
console.log(JSON.stringify(out, null, 2));
if (!out.allMatch) process.exit(1);
