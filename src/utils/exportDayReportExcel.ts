import type { Borders, Cell, Fill, Font, Workbook } from "exceljs";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { filterShipmentsBySessionYmd } from "./filterShipmentsBySessionYmd";
import { lookupCustomerEntryByName } from "./customerDirectoryCore";
import { findCustomerEntry } from "./customerBookingResolve";
import { formatDefaultRate } from "./customerAccountFields";
import {
  compactCustomerMatchKey,
  inferLetterKeyFromCustomerCode,
  normalizeCustomerShortCode,
} from "./customerCodeOps";
import { normalizeAgentCode } from "./customerProfileInputFormat";

/** Excel giới hạn 31 ký tự / tên sheet. */
const EXCEL_MAX_SHEET_NAME_LENGTH = 31;

const DEFAULT_HEADER_ROW_HEIGHT = 38;
const DEFAULT_DATA_ROW_HEIGHT = 18;
const DATA_BODY_FONT_SIZE = 11;
const HEADER_FONT_SIZE = 10;

/** Cột 1-based: MAWB (font monospace). */
const COL_MAWB = 4;

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Đúng mẫu Import Shipments (shipment-import-template.xlsx). */
export const SHIPMENT_EXPORT_HEADERS = [
  "Date",
  "Customer",
  "Customer Code",
  "MAWB",
  "Destination",
  "PCS",
  "Gross Weight",
  "Volume Weight",
  "Price",
  "Min Chargeable Kg",
  "Surcharge",
  "Warehouse Cost",
  "Customs Cost",
  "Labor Cost",
] as const;

/** Cột (1-based) căn phải: số liệu / chi phí */
const NUMERIC_RIGHT_ALIGN_COLS = new Set([6, 7, 8, 9, 10, 11, 12, 13, 14]);

const HEADER_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF15803D" },
};

const HEADER_FONT: Partial<Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: HEADER_FONT_SIZE,
  name: "Calibri",
};

const ZEBRA_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};

const BORDER: Partial<Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

const COLUMN_WIDTHS: readonly number[] = [
  12, 32, 14, 16, 12, 8, 14, 14, 12, 16, 12, 14, 14, 12,
];

const GUIDE_LINES = [
  "HƯỚNG DẪN IMPORT SHIPMENT",
  "",
  "1. Không thay đổi tên cột ở sheet 'Import Shipments'.",
  "2. Date: định dạng YYYY-MM-DD (vd 2026-07-01).",
  "3. Customer: tên khách hàng (bắt buộc). Nếu chưa tồn tại, hệ thống tự tạo mới.",
  "4. Customer Code (VD: ABC — 2-5 ký tự chữ A-Z, tùy chọn): dùng để khớp đúng khách khi trùng tên. Trống = khớp theo tên.",
  "5. MAWB: đúng 11 chữ số + check digit modulo 7 (vd 160-1234 5675). Trùng MAWB sẽ báo lỗi.",
  "6. Warehouse Cost: trống = Chargeable Weight × rate/kg (Settings). Customs/Labor: trống = Gross Weight × rate/kg.",
  "7. Nhập 0 tường minh = miễn phí. Surcharge: tổng VND phụ phí (trống = 0).",
  "8. Min Chargeable Kg: optional. Trống = không áp min (hoặc lấy min đã cấu hình trên khách nếu có). Billing Weight = max(CW, Min).",
  "9. Origin mặc định là SGN, không cần nhập.",
  "10. File xuất từ OPS dùng cùng mẫu — có thể chỉnh rồi import lại khi tính năng Import Excel sẵn sàng.",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fileTimeStamp(now: Date): string {
  return `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

function compactYmd(ymd: string): string {
  return ymd.trim().replaceAll("-", "");
}

function applyCellBorder(cell: Cell) {
  cell.border = BORDER as Borders;
}

/**
 * Hiển thị ngày phiên (sessionDate) dạng dd/mm/yyyy (helper giữ tương thích).
 * Chuỗi không khớp YYYY-MM-DD được trả nguyên (fallback an toàn).
 */
export function formatYmdToVnDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Date cột mẫu: luôn YYYY-MM-DD. */
export function formatYmdForShipmentExport(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ymd.trim();
}

function sheetTitleForDayReport(_sessionDateYmd: string): string {
  return "Import Shipments".slice(0, EXCEL_MAX_SHEET_NAME_LENGTH);
}

/** Đúng 2–5 chữ A–Z (không cắt tên dài kiểu CITYLINK → CITYL). */
function isExactSyncCode(raw: string): boolean {
  return /^[A-Z]{2,5}$/.test(normalizeAgentCode(raw));
}

/** Mã xuất Excel từ danh bạ: ưu tiên Customer Code 2–5 chữ. */
function exportCodeFromDirectoryEntry(entry: CustomerDirectoryEntry): string {
  const code = normalizeAgentCode(entry.code);
  if (isExactSyncCode(code)) return code;
  const letterKey = inferLetterKeyFromCustomerCode(code);
  if (letterKey) return letterKey;
  const shortCompact = compactCustomerMatchKey(entry.shortCode ?? "");
  if (isExactSyncCode(shortCompact)) return shortCompact;
  const short = normalizeCustomerShortCode(entry.shortCode ?? "");
  if (short && isExactSyncCode(normalizeAgentCode(short))) return normalizeAgentCode(short);
  return code || shortCompact || "";
}

/**
 * Mã khách xuất Excel:
 * 1) danh bạ (id / code / short / tên — khớp cả bỏ khoảng trắng/dấu)
 * 2) customerCode trên lô
 * 3) tên lô nếu đã là mã 2–5 chữ (VD: HTS, LINO)
 */
export function resolveExportCustomerCode(
  r: Shipment,
  customerDirectory: readonly CustomerDirectoryEntry[]
): string {
  const entry = findCustomerEntry(r, customerDirectory);
  if (entry) return exportCodeFromDirectoryEntry(entry);

  const onLot = normalizeAgentCode(r.customerCode ?? "");
  if (onLot) {
    if (isExactSyncCode(onLot)) return onLot;
    const letterKey = inferLetterKeyFromCustomerCode(onLot);
    if (letterKey) return letterKey;
    const onLotCompact = compactCustomerMatchKey(onLot);
    if (isExactSyncCode(onLotCompact)) return onLotCompact;
    return onLot;
  }

  const asCode = normalizeAgentCode(r.customer ?? "");
  if (isExactSyncCode(asCode)) return asCode;
  const asCompact = compactCustomerMatchKey(r.customer ?? "");
  if (isExactSyncCode(asCompact)) return asCompact;

  return "";
}

function resolveExportPrice(
  r: Shipment,
  customerDirectory: readonly CustomerDirectoryEntry[]
): string | number {
  const entry =
    findCustomerEntry(r, customerDirectory) ??
    lookupCustomerEntryByName(customerDirectory, r.customer);
  if (entry?.defaultRate != null && Number.isFinite(entry.defaultRate)) {
    return entry.defaultRate;
  }
  return formatDefaultRate(entry?.defaultRate) || "";
}

/**
 * Một dòng dữ liệu đúng 14 cột mẫu Import Shipments.
 */
function dayReportRowValues(
  r: Shipment,
  customerDirectory: readonly CustomerDirectoryEntry[]
): (string | number)[] {
  return [
    formatYmdForShipmentExport(r.sessionDate),
    r.customer?.trim() ?? "",
    resolveExportCustomerCode(r, customerDirectory),
    r.awb?.trim() ?? "",
    (r.dest ?? "").trim().toUpperCase(),
    r.pcs ?? "",
    r.kg ?? "",
    r.dimWeightKg != null && Number.isFinite(r.dimWeightKg) ? r.dimWeightKg : "",
    resolveExportPrice(r, customerDirectory),
    "", // Min Chargeable Kg — chưa có trên lô
    "", // Surcharge
    "", // Warehouse Cost
    "", // Customs Cost
    "", // Labor Cost
  ];
}

function styleHeaderCell(cell: Cell, colNumber: number) {
  cell.fill = HEADER_FILL;
  cell.font = HEADER_FONT as Font;
  applyCellBorder(cell);
  const baseAlign = {
    vertical: "middle" as const,
    wrapText: true,
  };
  if (NUMERIC_RIGHT_ALIGN_COLS.has(colNumber)) cell.alignment = { ...baseAlign, horizontal: "right" };
  else cell.alignment = { ...baseAlign, horizontal: "left" };
}

function styleBodyCell(cell: Cell, colNumber: number, rowIndexZeroBased: number) {
  const isZebra = rowIndexZeroBased % 2 === 1;
  if (isZebra) cell.fill = ZEBRA_FILL;
  applyCellBorder(cell);
  cell.font = {
    name: colNumber === COL_MAWB ? "Consolas" : "Calibri",
    size: DATA_BODY_FONT_SIZE,
  } as Font;
  if (NUMERIC_RIGHT_ALIGN_COLS.has(colNumber))
    cell.alignment = { vertical: "middle", horizontal: "right" };
  else
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
    };
}

/** Tên file mặc định khi tải từ trình duyệt. */
export function defaultDayReportFileName(sessionDateYmd: string, now = new Date()): string {
  return `OPS_shipments_${compactYmd(sessionDateYmd)}_${fileTimeStamp(now)}.xlsx`;
}

/**
 * Lọc đúng ngày phiên (trim), **giữ thứ tự** các phần tử trong `rows`.
 */
export function prepareDayReportRows(rows: Shipment[], sessionDateYmd: string): Shipment[] {
  return filterShipmentsBySessionYmd(rows, sessionDateYmd);
}

/**
 * Workbook xuất lô ngày — đúng mẫu Import Shipments (+ sheet Hướng dẫn).
 */
export async function buildDayReportWorkbook(
  rows: Shipment[],
  sessionDateYmd: string,
  customerDirectory: readonly CustomerDirectoryEntry[] = []
): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;

  const dayRows = prepareDayReportRows(rows, sessionDateYmd);
  const sheetName = sheetTitleForDayReport(sessionDateYmd);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: DEFAULT_DATA_ROW_HEIGHT },
  });

  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const headerRow = sheet.addRow([...SHIPMENT_EXPORT_HEADERS]);
  headerRow.height = DEFAULT_HEADER_ROW_HEIGHT;
  headerRow.eachCell((cell, colNumber) => {
    styleHeaderCell(cell, colNumber);
  });

  dayRows.forEach((r, idx) => {
    const row = sheet.addRow(dayReportRowValues(r, customerDirectory));
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      styleBodyCell(cell, colNumber, idx);
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: SHIPMENT_EXPORT_HEADERS.length },
  };

  const guide = wb.addWorksheet("Hướng dẫn");
  GUIDE_LINES.forEach((line, i) => {
    guide.getRow(i + 1).getCell(1).value = line;
  });
  guide.getColumn(1).width = 110;

  return wb;
}

/**
 * Tải file .xlsx: toàn bộ lô **mọi kho** đúng `sessionDate`, mẫu Import Shipments.
 */
export async function downloadDayReportExcel(
  rows: Shipment[],
  sessionDateYmd: string,
  customerDirectory: readonly CustomerDirectoryEntry[] = []
): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const wb = await buildDayReportWorkbook(rows, sessionDateYmd, customerDirectory);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: MIME_XLSX });
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = defaultDayReportFileName(sessionDateYmd);
    a.click();
  } catch (e) {
    console.error("[downloadDayReportExcel]", e);
    window.alert(e instanceof Error ? e.message : "Không tạo được file Excel. Thử lại hoặc kiểm tra bộ nhớ trình duyệt.");
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
