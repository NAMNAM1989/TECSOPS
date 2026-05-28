import type { Workbook, Borders, Font, Alignment } from "exceljs";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceExportPayload } from "../export/contracts/invoiceExportPayload";
import {
  buildInvoiceExportPayload,
  type BuildInvoiceExportOptions,
} from "../export/builders/buildInvoiceExportPayload";
import { formatDeclarationKg } from "../types/invoiceItem";
import { applyInvoiceExcelLayout } from "./invoiceExcelLayout.ts";

export type FillInvoiceWorksheetOptions = BuildInvoiceExportOptions;

const FONT_NORMAL: Partial<Font> = { name: "Times New Roman", size: 12 };
const FONT_BOLD: Partial<Font> = { ...FONT_NORMAL, bold: true };
const FONT_TITLE: Partial<Font> = { name: "Times New Roman", size: 18, bold: true };

const ALIGN_LEFT: Partial<Alignment> = { vertical: "middle", horizontal: "left" };
const ALIGN_CENTER: Partial<Alignment> = { vertical: "middle", horizontal: "center" };
const ALIGN_RIGHT: Partial<Alignment> = { vertical: "middle", horizontal: "right" };
const ALIGN_DESC_WRAP: Partial<Alignment> = { vertical: "top", horizontal: "left", wrapText: true };
const ALIGN_CENTER_WRAP: Partial<Alignment> = { ...ALIGN_CENTER, wrapText: true };

const THIN_BORDER: Partial<Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

const COL_COUNT = 10;

const COLUMNS = [
  { key: "no", header: "No" },
  { key: "desc", header: "Description of goods" },
  { key: "hs", header: "HS code" },
  { key: "origin", header: "Origin" },
  { key: "qty", header: "Quantity" },
  { key: "unit", header: "Unit" },
  { key: "price", header: "U.Price (USD)" },
  { key: "amount", header: "Amount (USD)" },
  { key: "spec", header: "kg/đv" },
  { key: "weight", header: "Trọng lượng (KG)" },
];

export function buildInvoiceWorkbookFromPayload(
  ExcelJS: { Workbook: new () => Workbook },
  payload: InvoiceExportPayload
): { wb: Workbook; invoiceNo: string; lastRow: number } {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("NNL", {
    pageSetup: {
      orientation: payload.page.orientation,
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.2, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });

  let row = 1;
  const titleRow = row;
  ws.getRow(row).height = 28;
  ws.getCell(row, 2).value = "NONCOMMERCIAL INVOICE & PACKING LIST";
  ws.getCell(row, 2).font = FONT_TITLE;
  ws.getCell(row, 2).alignment = ALIGN_LEFT;
  row += 2;

  const shipperBlockFirstRow = row;
  ws.getCell(row, 2).value = "THE SHIPPER:";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "Invoice No.:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = payload.meta.invoiceNo;
  ws.getCell(row, 6).font = FONT_BOLD;
  ws.getRow(row).height = 18;
  row++;

  ws.getCell(row, 2).value = "CÔNG TY TNHH NAM NAM LOGISTICS";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getCell(row, 5).value = "Date:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = payload.meta.dateStr;
  ws.getCell(row, 6).font = FONT_NORMAL;
  ws.getRow(row).height = 18;
  row++;

  ws.getCell(row, 2).value = "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "Flight:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = payload.meta.flightLine;
  ws.getCell(row, 6).font = FONT_NORMAL;
  ws.getRow(row).height = 18;
  row++;

  ws.getCell(row, 2).value = "THÀNH PHỐ HỒ CHÍ MINH";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "NO PAYMENT";
  ws.getCell(row, 5).font = FONT_BOLD;
  const shipperBlockLastRow = row;
  row += 2;

  const cneeLabelRow = row;
  ws.getCell(row, 2).value = "THE CNEE:";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getRow(row).height = 18;
  row++;

  const cneeFirstRow = row;
  for (let i = 0; i < 4; i++) {
    ws.getCell(row, 2).value = payload.cnee.lines[i] ?? "";
    ws.getCell(row, 2).font = FONT_NORMAL;
    ws.getCell(row, 2).alignment = ALIGN_DESC_WRAP;
    row++;
  }
  const cneeLastRow = row - 1;

  const headerRow = row;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = col.header;
    cell.font = FONT_BOLD;
    cell.alignment = ALIGN_CENTER_WRAP;
    cell.border = THIN_BORDER;
  });
  row++;

  const goodsFirstRow = row;
  payload.lines.forEach((line) => {
    ws.getCell(row, 1).value = line.no;
    ws.getCell(row, 1).font = FONT_NORMAL;
    ws.getCell(row, 1).alignment = ALIGN_CENTER;
    ws.getCell(row, 1).border = THIN_BORDER;

    ws.getCell(row, 2).value = line.description;
    ws.getCell(row, 2).font = FONT_NORMAL;
    ws.getCell(row, 2).alignment = ALIGN_DESC_WRAP;
    ws.getCell(row, 2).border = THIN_BORDER;

    ws.getCell(row, 3).value = line.hsCode;
    ws.getCell(row, 3).font = FONT_NORMAL;
    ws.getCell(row, 3).alignment = ALIGN_CENTER;
    ws.getCell(row, 3).border = THIN_BORDER;

    ws.getCell(row, 4).value = line.origin;
    ws.getCell(row, 4).font = FONT_NORMAL;
    ws.getCell(row, 4).alignment = ALIGN_CENTER;
    ws.getCell(row, 4).border = THIN_BORDER;

    ws.getCell(row, 5).value = line.quantity;
    ws.getCell(row, 5).font = FONT_NORMAL;
    ws.getCell(row, 5).alignment = ALIGN_CENTER;
    ws.getCell(row, 5).border = THIN_BORDER;

    ws.getCell(row, 6).value = line.unit;
    ws.getCell(row, 6).font = FONT_NORMAL;
    ws.getCell(row, 6).alignment = ALIGN_CENTER;
    ws.getCell(row, 6).border = THIN_BORDER;

    ws.getCell(row, 7).value = line.unitPriceUsd;
    ws.getCell(row, 7).font = FONT_NORMAL;
    ws.getCell(row, 7).alignment = ALIGN_RIGHT;
    ws.getCell(row, 7).border = THIN_BORDER;
    ws.getCell(row, 7).numFmt = "#,##0.00";

    ws.getCell(row, 8).value = { formula: `E${row}*G${row}` };
    ws.getCell(row, 8).font = FONT_NORMAL;
    ws.getCell(row, 8).alignment = ALIGN_RIGHT;
    ws.getCell(row, 8).border = THIN_BORDER;
    ws.getCell(row, 8).numFmt = "#,##0.00";

    ws.getCell(row, 9).value = line.kgPerUnit;
    ws.getCell(row, 9).font = FONT_NORMAL;
    ws.getCell(row, 9).alignment = ALIGN_RIGHT;
    ws.getCell(row, 9).border = THIN_BORDER;
    ws.getCell(row, 9).numFmt = "#,##0.00";

    ws.getCell(row, 10).value = { formula: `E${row}*I${row}` };
    ws.getCell(row, 10).font = FONT_NORMAL;
    ws.getCell(row, 10).alignment = ALIGN_RIGHT;
    ws.getCell(row, 10).border = THIN_BORDER;
    ws.getCell(row, 10).numFmt = "#,##0.00";

    row++;
  });
  const goodsLastRow = row - 1;

  ws.getRow(row).height = 28;
  ws.getCell(row, 2).value = "TOTAL";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getCell(row, 2).alignment = ALIGN_LEFT;
  ws.getCell(row, 2).border = THIN_BORDER;
  for (let c = 1; c <= COL_COUNT; c++) {
    if (c === 2) continue;
    ws.getCell(row, c).border = THIN_BORDER;
  }
  if (payload.lines.length > 0) {
    const sumAmtCell = ws.getCell(row, 8);
    sumAmtCell.value = { formula: `SUM(H${goodsFirstRow}:H${goodsLastRow})` };
    sumAmtCell.font = FONT_BOLD;
    sumAmtCell.alignment = ALIGN_RIGHT;
    sumAmtCell.border = THIN_BORDER;
    sumAmtCell.numFmt = "#,##0.00";

    const sumWeightCell = ws.getCell(row, 10);
    sumWeightCell.value = { formula: `SUM(J${goodsFirstRow}:J${goodsLastRow})` };
    sumWeightCell.font = FONT_BOLD;
    sumWeightCell.alignment = ALIGN_RIGHT;
    sumWeightCell.border = THIN_BORDER;
    sumWeightCell.numFmt = "#,##0.00";
  }
  row++;

  const footerFirstRow = row;
  ws.getCell(row, 2).value =
    payload.footer.cartons != null && payload.footer.cartons > 0
      ? `1.   Total carton: ${payload.footer.cartons} CTNS`
      : "1.   Total carton:";
  ws.getCell(row, 2).font = FONT_BOLD;
  row++;

  ws.getCell(row, 2).value =
    payload.footer.grossKg > 0
      ? `2.   Total gross weight: ${formatDeclarationKg(payload.footer.grossKg)} KGM`
      : "2.   Total gross weight:";
  ws.getCell(row, 2).font = FONT_BOLD;
  const footerLastRow = row;

  applyInvoiceExcelLayout(ws, {
    payload,
    columnHeaders: COLUMNS.map((col) => col.header),
    titleRow,
    shipperBlockFirstRow,
    shipperBlockLastRow,
    cneeLabelRow,
    headerRow,
    cneeFirstRow,
    cneeLastRow,
    goodsFirstRow,
    goodsLastRow,
    footerFirstRow,
    footerLastRow,
  });

  const lastRow = row;
  ws.pageSetup.printArea = `A1:J${lastRow}`;

  return { wb, invoiceNo: payload.meta.invoiceNo, lastRow };
}

export function buildInvoiceWorkbook(
  ExcelJS: { Workbook: new () => Workbook },
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  options: FillInvoiceWorksheetOptions
): { wb: Workbook; invoiceNo: string; lastRow: number } {
  const payload = buildInvoiceExportPayload(shipment, directory, options);
  return buildInvoiceWorkbookFromPayload(ExcelJS, payload);
}

export { buildInvoiceExportPayload };
