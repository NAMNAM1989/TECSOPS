import type { Borders, Cell, Font } from "exceljs";
import type { Shipment } from "../types/shipment";
import { notifyError, notifyWarning } from "../ui/notify";
import { canPrintDimScscReport } from "./printDimReport";
import { buildScscDimListModel, dimKgExcelLineNumFmt, type ScscDimListModel } from "./scscDimListReport";
import { awbForFilename, downloadXlsxBuffer } from "./downloadXlsx";

const LAST_COL = 7;
const BLACK = "FF000000";

/** Meta không viền — bắt đầu từ hàng 1; sau meta là dòng trống + header bảng DIM */
const META_START_ROW = 1;
const META_ROW_COUNT = 5;
const ROW_SPACER_BEFORE_TABLE = 6;
const ROW_TABLE_HEADER = 7;

const THIN: Partial<Borders> = {
  top: { style: "thin", color: { argb: BLACK } },
  left: { style: "thin", color: { argb: BLACK } },
  bottom: { style: "thin", color: { argb: BLACK } },
  right: { style: "thin", color: { argb: BLACK } },
};

const LABEL_FONT: Partial<Font> = {
  bold: true,
  size: 10,
  name: "Calibri",
  color: { argb: BLACK },
};

const HEADER_FONT: Partial<Font> = {
  bold: true,
  size: 10,
  name: "Calibri",
  color: { argb: BLACK },
};

const BODY_FONT: Partial<Font> = {
  size: 11,
  name: "Calibri",
  color: { argb: BLACK },
};

function setThinBorder(cell: Cell) {
  cell.border = THIN as Borders;
}

/** Meta: chữ rõ, không gán viền (trống, không kẻ ô) */
function styleMetaLabel(cell: Cell) {
  cell.font = LABEL_FONT as Font;
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function styleMetaValue(cell: Cell) {
  cell.font = { size: 10, name: "Calibri", color: { argb: BLACK } };
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

/** Header bảng DIM: viền đen + gạch dưới đậm */
function styleTableHeaderCell(cell: Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: BLACK } },
    left: { style: "thin", color: { argb: BLACK } },
    bottom: { style: "medium", color: { argb: BLACK } },
    right: { style: "thin", color: { argb: BLACK } },
  } as Borders;
  cell.font = HEADER_FONT as Font;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function styleBodyCell(cell: Cell, col: number) {
  setThinBorder(cell);
  cell.font = BODY_FONT as Font;
  cell.alignment = {
    vertical: "middle",
    horizontal: col === 1 || col === 7 ? "center" : "right",
  };
}

async function fillListScscSheet(
  sheet: import("exceljs").Worksheet,
  s: Shipment,
  model: ScscDimListModel
) {
  sheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 10 },
  ];

  const flightDate = `${s.flight.trim()} / ${s.flightDate.trim()}`;
  const metaRows: [string, string][] = [
    ["MAWB/BL", s.awb],
    ["FLIGHT / DATE", flightDate],
    ["DESTINATION", s.dest],
    ["Tổng kiện", String(model.totalPcs)],
    ["DIM (kg)", model.dimKgStrip],
  ];

  for (let i = 0; i < META_ROW_COUNT; i++) {
    const r = META_START_ROW + i;
    const row = sheet.getRow(r);
    row.height = 20;
    const [k, v] = metaRows[i]!;
    row.getCell(1).value = k;
    styleMetaLabel(row.getCell(1));
    sheet.mergeCells(r, 2, r, LAST_COL);
    const vCell = row.getCell(2);
    vCell.value = v;
    styleMetaValue(vCell);
  }

  sheet.getRow(ROW_SPACER_BEFORE_TABLE).height = 8;

  const headers = ["STT", "DÀI", "RỘNG", "CAO", "SỐ KIỆN", "DIM (kg)", "NGUỒN"];
  const headerRow = sheet.getRow(ROW_TABLE_HEADER);
  headerRow.height = 26;
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    styleTableHeaderCell(cell);
  });

  const dimFmt = dimKgExcelLineNumFmt(model.rule?.lineRound);
  const cmFmt = "0.00";
  const dataStart = ROW_TABLE_HEADER + 1;

  model.rows.forEach((r, idx) => {
    const row = sheet.getRow(dataStart + idx);
    row.height = 20;
    row.getCell(1).value = r.stt;
    row.getCell(2).value = r.lCm;
    row.getCell(3).value = r.wCm;
    row.getCell(4).value = r.hCm;
    row.getCell(5).value = r.pcs;
    row.getCell(6).value = r.dimKg != null ? r.dimKg : "—";
    row.getCell(7).value = r.estimated ? "Ước" : "Đo";

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      styleBodyCell(cell, colNumber);
      if (colNumber >= 2 && colNumber <= 4) {
        cell.numFmt = cmFmt;
      }
      if (colNumber === 6 && r.dimKg != null) {
        cell.numFmt = dimFmt;
      }
      if (colNumber === 7 && r.estimated) {
        cell.font = { ...BODY_FONT, italic: true } as Font;
      }
    });
  });

  const lastDataRow = dataStart + model.rows.length - 1;
  sheet.autoFilter = {
    from: { row: ROW_TABLE_HEADER, column: 1 },
    to: { row: lastDataRow, column: LAST_COL },
  };

  sheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
}

async function buildListScscWorkbook(s: Shipment, model: ScscDimListModel) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  wb.created = new Date();

  const sheet = wb.addWorksheet("LIST SCSC", {
    views: [{ state: "frozen", ySplit: ROW_TABLE_HEADER }],
    properties: { defaultRowHeight: 18 },
  });
  await fillListScscSheet(sheet, s, model);
  return wb;
}

/** Excel LIST SCSC — meta không viền; chỉ bảng DIM có lưới đen. */
export function downloadScscDimListExcel(s: Shipment): void {
  if (!canPrintDimScscReport(s) || !s.dimLines) {
    notifyWarning(
      "Chỉ áp dụng cho kho SCSC (TECS-SCSC hoặc KHO SCSC) và lô đã có nhập DIM (chi tiết kiện).",
      "Xuất DIM SCSC"
    );
    return;
  }
  const model = buildScscDimListModel(s);
  if (!model) {
    notifyWarning("Không đọc được dữ liệu DIM.", "Xuất DIM SCSC");
    return;
  }

  void (async () => {
    try {
      const wb = await buildListScscWorkbook(s, model);
      const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      downloadXlsxBuffer(buf, `LIST_SCSC_${awbForFilename(s.awb)}.xlsx`);
    } catch (e) {
      console.error("[downloadScscDimListExcel]", e);
      notifyError(
        e instanceof Error ? e.message : "Không tạo được file Excel. Thử lại hoặc kiểm tra bộ nhớ trình duyệt.",
        "Xuất DIM SCSC"
      );
    }
  })();
}
