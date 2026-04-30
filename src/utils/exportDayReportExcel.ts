import type { Borders, Cell, Fill, Font, Workbook } from "exceljs";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { filterShipmentsBySessionYmd } from "./filterShipmentsBySessionYmd";
import { formatShipmentDimWeightKg } from "./volumetricDim";
import { lookupCustomerCodeByName } from "./customerDirectoryCore";

/** Excel giới hạn 31 ký tự / tên sheet. */
const EXCEL_MAX_SHEET_NAME_LENGTH = 31;

const DEFAULT_HEADER_ROW_HEIGHT = 38;
const DEFAULT_DATA_ROW_HEIGHT = 18;
const DATA_BODY_FONT_SIZE = 11;
const HEADER_FONT_SIZE = 10;

/** Cột 1-based: AWB (font monospace). */
const COL_STT = 1;
const COL_AWB = 3;

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DAY_REPORT_HEADERS = [
  "STT",
  "Ngày hàng vào",
  "AWB",
  "DEST",
  "Số kiện",
  "Số KG",
  "VOLUME WEIGHT",
  "Tên khách hàng",
  "Mã Khách Hàng",
] as const;

/** Cột (1-based) căn phải: số kiện, KG, VOLUME WEIGHT */
const NUMERIC_RIGHT_ALIGN_COLS = new Set([5, 6, 7]);

/** Xanh lá đậm — tương phản tốt với chữ trắng */
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

/** Độ rộng cột: đủ cho tiêu đề + nút AutoFilter (Excel vẽ mũi tên lọc bên phải ô). */
const COLUMN_WIDTHS: readonly number[] = [8, 22, 22, 10, 14, 12, 22, 36, 16];

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
 * Hiển thị ngày phiên (sessionDate) dạng dd/mm/yyyy cho báo cáo.
 * Chuỗi không khớp YYYY-MM-DD được trả nguyên (fallback an toàn).
 */
export function formatYmdToVnDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Tên sheet theo ngày phiên (giữ đúng chuỗi đầu vào + cắt 31 ký tự như Excel). */
function sheetTitleForDayReport(sessionDateYmd: string): string {
  return `Ngay_${sessionDateYmd}`.slice(0, EXCEL_MAX_SHEET_NAME_LENGTH);
}

/**
 * Một dòng dữ liệu (giá trị ô) từ một lô.
 * `reportStt` = STT **báo cáo** 1…n liên tục trên file (không dùng `r.stt` theo từng kho).
 */
function dayReportRowValues(
  r: Shipment,
  reportStt: number,
  customerDirectory: readonly CustomerDirectoryEntry[]
): (string | number)[] {
  const code =
    lookupCustomerCodeByName(customerDirectory, r.customer) ||
    (r.customerCode && String(r.customerCode).trim()) ||
    "";
  return [
    reportStt,
    formatYmdToVnDisplay(r.sessionDate),
    r.awb,
    r.dest,
    r.pcs ?? "",
    r.kg ?? "",
    r.dimWeightKg != null ? formatShipmentDimWeightKg(r.flight, r.dimWeightKg) : "",
    r.customer,
    code,
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
  if (colNumber === COL_STT) cell.alignment = { ...baseAlign, horizontal: "center" };
  else if (NUMERIC_RIGHT_ALIGN_COLS.has(colNumber)) cell.alignment = { ...baseAlign, horizontal: "right" };
  else cell.alignment = { ...baseAlign, horizontal: "left" };
}

function styleBodyCell(cell: Cell, colNumber: number, rowIndexZeroBased: number) {
  const isZebra = rowIndexZeroBased % 2 === 1;
  if (isZebra) cell.fill = ZEBRA_FILL;
  applyCellBorder(cell);
  cell.font = {
    name: colNumber === COL_AWB ? "Consolas" : "Calibri",
    size: DATA_BODY_FONT_SIZE,
  } as Font;
  if (colNumber === COL_STT) cell.alignment = { vertical: "middle", horizontal: "center" };
  else if (NUMERIC_RIGHT_ALIGN_COLS.has(colNumber))
    cell.alignment = { vertical: "middle", horizontal: "right" };
  else
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
    };
}

/** Tên file mặc định khi tải từ trình duyệt. */
export function defaultDayReportFileName(sessionDateYmd: string, now = new Date()): string {
  return `OPS_bao_cao_${compactYmd(sessionDateYmd)}_${fileTimeStamp(now)}.xlsx`;
}

/**
 * Lọc đúng ngày phiên (trim), **giữ thứ tự** các phần tử trong `rows` (trên → dưới như nguồn / API),
 * không sắp theo kho hay STT toàn cục.
 */
export function prepareDayReportRows(rows: Shipment[], sessionDateYmd: string): Shipment[] {
  return filterShipmentsBySessionYmd(rows, sessionDateYmd);
}

/**
 * Workbook báo cáo ngày — định dạng: header xanh, viền, zebra, freeze hàng 1, AutoFilter.
 * `exceljs` chỉ được tải khi gọi hàm này (dynamic import).
 * Gồm **mọi lô** (mọi kho) khớp `sessionDateYmd`, thứ tự dòng = thứ tự trong `prepareDayReportRows`.
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

  const headerRow = sheet.addRow([...DAY_REPORT_HEADERS]);
  headerRow.height = DEFAULT_HEADER_ROW_HEIGHT;
  headerRow.eachCell((cell, colNumber) => {
    styleHeaderCell(cell, colNumber);
  });

  dayRows.forEach((r, idx) => {
    const row = sheet.addRow(dayReportRowValues(r, idx + 1, customerDirectory));
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      styleBodyCell(cell, colNumber, idx);
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: DAY_REPORT_HEADERS.length },
  };

  return wb;
}

/**
 * Tải file .xlsx: toàn bộ lô **mọi kho** đúng `sessionDate` (ngày báo cáo), không lọc theo trạng thái UI.
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
