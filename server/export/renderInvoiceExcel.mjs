import ExcelJS from "exceljs";
import { applyInvoiceExcelLayout } from "./invoiceExcelLayout.mjs";

const FONT_NORMAL = { name: "Times New Roman", size: 12 };
const FONT_BOLD = { ...FONT_NORMAL, bold: true };
const FONT_TITLE = { name: "Times New Roman", size: 18, bold: true };
const ALIGN_LEFT = { vertical: "middle", horizontal: "left" };
const ALIGN_CENTER = { vertical: "middle", horizontal: "center" };
const ALIGN_RIGHT = { vertical: "middle", horizontal: "right" };
const ALIGN_WRAP = { vertical: "middle", wrapText: true };
const ALIGN_CENTER_WRAP = { ...ALIGN_CENTER, wrapText: true };
const THIN_BORDER = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};
const COL_COUNT = 10;
const COLUMN_HEADERS = [
  "No",
  "Description of goods",
  "HS code",
  "Origin",
  "Quantity",
  "Unit",
  "U.Price\n(FCA)(USD)",
  "Amount\n(USD)",
  "Quy cách\n(kg/đv)",
  "Trọng lượng\n(KG)",
];

/**
 * @param {object} payload InvoiceExportPayload
 * @returns {Promise<Buffer>}
 */
export async function renderInvoiceExcelBuffer(payload) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("NNL", {
    pageSetup: {
      orientation: "portrait",
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
  ws.getCell(row, 2).value = "NONCOMMERCIAL INVOICE";
  ws.getCell(row, 2).font = FONT_TITLE;
  ws.getCell(row, 2).alignment = ALIGN_LEFT;
  row += 2;

  const shipperBlockFirstRow = row;
  ws.getCell(row, 2).value = "THE SHIPPER:";
  ws.getCell(row, 5).value = "Invoice No.:";
  ws.getCell(row, 6).value = payload.meta.invoiceNo;
  ws.getCell(row, 6).font = FONT_BOLD;
  row++;

  ws.getCell(row, 2).value = "CÔNG TY TNHH NAM NAM LOGISTICS";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getCell(row, 5).value = "Date:";
  ws.getCell(row, 6).value = payload.meta.dateStr;
  row++;

  ws.getCell(row, 2).value = "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT";
  ws.getCell(row, 5).value = "Flight:";
  ws.getCell(row, 6).value = payload.meta.flightLine;
  row++;

  ws.getCell(row, 2).value = "THÀNH PHỐ HỒ CHÍ MINH";
  ws.getCell(row, 5).value = "NO PAYMENT";
  ws.getCell(row, 5).font = FONT_BOLD;
  const shipperBlockLastRow = row;
  row += 2;

  const cneeLabelRow = row;
  ws.getCell(row, 2).value = "THE CNEE:";
  ws.getCell(row, 2).font = FONT_BOLD;
  row++;

  const cneeFirstRow = row;
  for (let i = 0; i < 4; i++) {
    ws.getCell(row, 2).value = payload.cnee.lines[i] ?? "";
    ws.getCell(row, 2).alignment = ALIGN_WRAP;
    row++;
  }
  const cneeLastRow = row - 1;
  row++;

  const headerRow = row;
  COLUMN_HEADERS.forEach((header, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = header;
    cell.font = FONT_BOLD;
    cell.alignment = ALIGN_CENTER_WRAP;
    cell.border = THIN_BORDER;
  });
  row++;

  const goodsFirstRow = row;
  for (const line of payload.lines ?? []) {
    ws.getCell(row, 1).value = line.no;
    ws.getCell(row, 1).alignment = ALIGN_CENTER;
    ws.getCell(row, 1).border = THIN_BORDER;
    ws.getCell(row, 2).value = line.description;
    ws.getCell(row, 2).alignment = ALIGN_WRAP;
    ws.getCell(row, 2).border = THIN_BORDER;
    ws.getCell(row, 3).value = line.hsCode;
    ws.getCell(row, 3).alignment = ALIGN_CENTER;
    ws.getCell(row, 3).border = THIN_BORDER;
    ws.getCell(row, 4).value = line.origin || "VN";
    ws.getCell(row, 4).alignment = ALIGN_CENTER;
    ws.getCell(row, 4).border = THIN_BORDER;
    ws.getCell(row, 5).value = line.quantity;
    ws.getCell(row, 5).alignment = ALIGN_CENTER;
    ws.getCell(row, 5).border = THIN_BORDER;
    ws.getCell(row, 6).value = line.unit;
    ws.getCell(row, 6).alignment = ALIGN_CENTER;
    ws.getCell(row, 6).border = THIN_BORDER;
    ws.getCell(row, 7).value = line.unitPriceUsd;
    ws.getCell(row, 7).alignment = ALIGN_RIGHT;
    ws.getCell(row, 7).border = THIN_BORDER;
    ws.getCell(row, 7).numFmt = "#,##0.00";
    ws.getCell(row, 8).value = { formula: `E${row}*G${row}` };
    ws.getCell(row, 8).alignment = ALIGN_RIGHT;
    ws.getCell(row, 8).border = THIN_BORDER;
    ws.getCell(row, 8).numFmt = "#,##0.00";
    ws.getCell(row, 9).value = line.kgPerUnit;
    ws.getCell(row, 9).alignment = ALIGN_RIGHT;
    ws.getCell(row, 9).border = THIN_BORDER;
    ws.getCell(row, 9).numFmt = "#,##0.00";
    ws.getCell(row, 10).value = { formula: `E${row}*I${row}` };
    ws.getCell(row, 10).alignment = ALIGN_RIGHT;
    ws.getCell(row, 10).border = THIN_BORDER;
    ws.getCell(row, 10).numFmt = "#,##0.00";
    row++;
  }
  const goodsLastRow = row - 1;

  ws.getCell(row, 2).value = "TOTAL";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getCell(row, 2).border = THIN_BORDER;
  for (let c = 1; c <= COL_COUNT; c++) {
    if (c !== 2) ws.getCell(row, c).border = THIN_BORDER;
  }
  if ((payload.lines ?? []).length > 0) {
    ws.getCell(row, 8).value = { formula: `SUM(H${goodsFirstRow}:H${goodsLastRow})` };
    ws.getCell(row, 8).font = FONT_BOLD;
    ws.getCell(row, 8).numFmt = "#,##0.00";
    ws.getCell(row, 10).value = { formula: `SUM(J${goodsFirstRow}:J${goodsLastRow})` };
    ws.getCell(row, 10).font = FONT_BOLD;
    ws.getCell(row, 10).numFmt = "#,##0";
  }
  row++;

  const footerFirstRow = row;
  ws.getCell(row, 2).value =
    payload.footer?.cartons > 0
      ? `1.   Total carton: ${payload.footer.cartons} CTNS`
      : "1.   Total carton:";
  ws.getCell(row, 2).font = FONT_BOLD;
  row++;
  ws.getCell(row, 2).value =
    payload.footer?.grossKg > 0
      ? `2.   Total gross weight: ${payload.footer.grossKg} KGM`
      : "2.   Total gross weight:";
  ws.getCell(row, 2).font = FONT_BOLD;
  const footerLastRow = row;

  applyInvoiceExcelLayout(ws, {
    payload,
    columnHeaders: COLUMN_HEADERS,
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

  ws.pageSetup.printArea = `A1:J${row}`;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
