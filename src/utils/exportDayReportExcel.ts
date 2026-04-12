import type { Borders, Cell, Fill, Font, Workbook } from "exceljs";
import type { Shipment } from "../types/shipment";

/** Hiển thị ngày phiên (sessionDate) dạng dd/mm/yyyy cho báo cáo */
export function formatYmdToVnDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const DAY_REPORT_HEADERS = [
  "STT",
  "Ngày hàng vào",
  "AWB",
  "DEST",
  "Số kiện",
  "Số KG",
  "VOLUME WEIGHT",
  "Tên khách hàng",
  "Note",
] as const;

/** Cột (1-based) căn phải: số kiện, KG, VOLUME WEIGHT */
const NUM_COLS = new Set([5, 6, 7]);

const STT_COL = 1;

/** Xanh lá đậm — tương phản tốt với chữ trắng */
const HEADER_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF15803D" },
};

const HEADER_FONT: Partial<Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
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

function applyCellBorder(cell: Cell) {
  cell.border = BORDER as Borders;
}

/** Tên file mặc định khi tải từ trình duyệt. */
export function defaultDayReportFileName(sessionDateYmd: string): string {
  return `TECSOPS-bao-cao-ngay-${sessionDateYmd}.xlsx`;
}

/**
 * Workbook báo cáo ngày — định dạng: header xanh, viền, zebra, freeze hàng 1, AutoFilter.
 * `exceljs` chỉ được tải khi gọi hàm này (dynamic import).
 */
export async function buildDayReportWorkbook(rows: Shipment[], sessionDateYmd: string): Promise<Workbook> {
  const ExcelJS = (await import("exceljs")).default;

  const sorted = [...rows].sort((a, b) => a.stt - b.stt);
  const sheetName = `Ngay_${sessionDateYmd}`.slice(0, 31);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  /* Đủ rộng để chữ tiêu đề + nút AutoFilter không chồng lên nhau (Excel vẽ mũi tên lọc bên phải ô) */
  sheet.columns = [
    { width: 8 },
    { width: 22 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 22 },
    { width: 36 },
    { width: 42 },
  ];

  const headerRow = sheet.addRow([...DAY_REPORT_HEADERS]);
  headerRow.height = 38;
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT as Font;
    applyCellBorder(cell);
    const baseAlign = {
      vertical: "middle" as const,
      wrapText: true,
    };
    if (colNumber === STT_COL) cell.alignment = { ...baseAlign, horizontal: "center" };
    else if (NUM_COLS.has(colNumber)) cell.alignment = { ...baseAlign, horizontal: "right" };
    else cell.alignment = { ...baseAlign, horizontal: "left" };
  });

  sorted.forEach((r, idx) => {
    const row = sheet.addRow([
      r.stt,
      formatYmdToVnDisplay(r.sessionDate),
      r.awb,
      r.dest,
      r.pcs ?? "",
      r.kg ?? "",
      r.dimWeightKg ?? "",
      r.customer,
      r.note ?? "",
    ]);
    const isZebra = idx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (isZebra) cell.fill = ZEBRA_FILL;
      applyCellBorder(cell);
      cell.font = {
        name: colNumber === 3 ? "Consolas" : "Calibri",
        size: 11,
      } as Font;
      if (colNumber === STT_COL) cell.alignment = { vertical: "middle", horizontal: "center" };
      else if (NUM_COLS.has(colNumber))
        cell.alignment = { vertical: "middle", horizontal: "right" };
      else cell.alignment = { vertical: "middle", horizontal: "left", wrapText: colNumber === 9 };
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: DAY_REPORT_HEADERS.length },
  };

  return wb;
}

/**
 * Tải file .xlsx: các lô đúng `sessionDate` đang xem, cột báo cáo cuối ngày.
 */
export async function downloadDayReportExcel(rows: Shipment[], sessionDateYmd: string): Promise<void> {
  const wb = await buildDayReportWorkbook(rows, sessionDateYmd);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultDayReportFileName(sessionDateYmd);
  a.click();
  URL.revokeObjectURL(url);
}
