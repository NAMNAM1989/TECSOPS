import type { Workbook, Borders, Font, Alignment } from "exceljs";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { buildShipmentCneeBodyLines } from "./shipmentCneeCopyBlock";
import {
  buildInvoiceNumber,
  formatInvoiceFlightLine,
  formatInvoiceSheetDate,
} from "./shipmentInvoiceCore";

export type FillInvoiceWorksheetOptions = {
  items: InvoiceLineItem[];
  at?: Date;
};

// ─── Style constants ────────────────────────────────────────────

const FONT_NORMAL: Partial<Font> = { name: "Times New Roman", size: 12 };
const FONT_BOLD: Partial<Font> = { ...FONT_NORMAL, bold: true };
const FONT_TITLE: Partial<Font> = { name: "Times New Roman", size: 18, bold: true };

const ALIGN_LEFT: Partial<Alignment> = { vertical: "middle", horizontal: "left" };
const ALIGN_CENTER: Partial<Alignment> = { vertical: "middle", horizontal: "center" };
const ALIGN_RIGHT: Partial<Alignment> = { vertical: "middle", horizontal: "right" };
const ALIGN_WRAP: Partial<Alignment> = { vertical: "middle", wrapText: true };
const ALIGN_CENTER_WRAP: Partial<Alignment> = { ...ALIGN_CENTER, wrapText: true };

const THIN_BORDER: Partial<Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

// ─── Column layout ──────────────────────────────────────────────

const COLUMNS = [
  { key: "no", width: 4.5, header: "No" },
  { key: "desc", width: 30, header: "Description of goods" },
  { key: "hs", width: 14, header: "HS code" },
  { key: "origin", width: 8, header: "Origin" },
  { key: "qty", width: 10, header: "Quantity" },
  { key: "unit", width: 9, header: "Unit" },
  { key: "price", width: 12, header: "U.Price\n(FCA)(USD)" },
  { key: "amount", width: 13, header: "Amount\n(USD)" },
];

// ─── Builder ────────────────────────────────────────────────────

/**
 * Tạo workbook invoice mới hoàn toàn — không load template, tránh lỗi XML.
 * Thiết kế theo mẫu Noncommercial Invoice chuẩn hải quan.
 */
export function buildInvoiceWorkbook(
  ExcelJS: { Workbook: new () => Workbook },
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  options: FillInvoiceWorksheetOptions,
): { wb: Workbook; invoiceNo: string; lastRow: number } {
  const at = options.at ?? new Date();
  const items = options.items;
  const invoiceNo = buildInvoiceNumber(shipment, directory, at);
  const flightLine = formatInvoiceFlightLine(shipment);
  const cneeLines = buildShipmentCneeBodyLines(shipment, directory);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("NNL", {
    pageSetup: {
      orientation: "portrait",
      paperSize: 9, // A4
      fitToPage: false,
      margins: { left: 0.35, right: 0.2, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });

  // Set column widths
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  let row = 1;

  // ─── Row 1: Title ─────────────────────────────────
  const titleRow = ws.getRow(row);
  titleRow.height = 28;
  ws.getCell(row, 2).value = "NONCOMMERCIAL INVOICE";
  ws.getCell(row, 2).font = FONT_TITLE;
  ws.getCell(row, 2).alignment = ALIGN_LEFT;
  row++;

  // ─── Row 2: blank separator ───────────────────────
  row++;

  // ─── Row 3: Shipper + Invoice No ─────────────────
  ws.getCell(row, 2).value = "THE SHIPPER:";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "Invoice No.:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = invoiceNo;
  ws.getCell(row, 6).font = FONT_BOLD;
  ws.getRow(row).height = 18;
  row++;

  // ─── Row 4: Company + Date ────────────────────────
  ws.getCell(row, 2).value = "CÔNG TY TNHH NAM NAM LOGISTICS";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getCell(row, 5).value = "Date:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = formatInvoiceSheetDate(at);
  ws.getCell(row, 6).font = FONT_NORMAL;
  ws.getRow(row).height = 18;
  row++;

  // ─── Row 5: Address + Flight ──────────────────────
  ws.getCell(row, 2).value = "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "Flight:";
  ws.getCell(row, 5).font = FONT_NORMAL;
  ws.getCell(row, 6).value = flightLine;
  ws.getCell(row, 6).font = FONT_NORMAL;
  ws.getRow(row).height = 18;
  row++;

  // ─── Row 6: City + NO PAYMENT ─────────────────────
  ws.getCell(row, 2).value = "THÀNH PHỐ HỒ CHÍ MINH";
  ws.getCell(row, 2).font = FONT_NORMAL;
  ws.getCell(row, 5).value = "NO PAYMENT";
  ws.getCell(row, 5).font = FONT_BOLD;
  ws.getRow(row).height = 18;
  row++;

  // ─── Row 7: blank ─────────────────────────────────
  row++;

  // ─── Row 8: THE CNEE ──────────────────────────────
  ws.getCell(row, 2).value = "THE CNEE:";
  ws.getCell(row, 2).font = FONT_BOLD;
  ws.getRow(row).height = 18;
  row++;

  // ─── Rows 9-12: CNEE lines ────────────────────────
  for (let i = 0; i < 4; i++) {
    const line = cneeLines[i] ?? "";
    ws.getCell(row, 2).value = line;
    ws.getCell(row, 2).font = FONT_NORMAL;
    ws.getCell(row, 2).alignment = ALIGN_WRAP;
    ws.getRow(row).height = 16;
    row++;
  }

  // ─── Row 13: blank separator ──────────────────────
  row++;

  // ─── Header row (goods table) ─────────────────────
  ws.getRow(row).height = 36;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = col.header;
    cell.font = FONT_BOLD;
    cell.alignment = ALIGN_CENTER_WRAP;
    cell.border = THIN_BORDER;
  });
  row++;

  // ─── Goods rows ───────────────────────────────────
  const goodsFirstRow = row;
  items.forEach((item, idx) => {
    ws.getRow(row).height = estimateRowHeight(item.description);
    // No
    const noCell = ws.getCell(row, 1);
    noCell.value = idx + 1;
    noCell.font = FONT_NORMAL;
    noCell.alignment = ALIGN_CENTER;
    noCell.border = THIN_BORDER;
    // Description
    const descCell = ws.getCell(row, 2);
    descCell.value = item.description;
    descCell.font = FONT_NORMAL;
    descCell.alignment = ALIGN_WRAP;
    descCell.border = THIN_BORDER;
    // HS code
    const hsCell = ws.getCell(row, 3);
    hsCell.value = item.hsCode || "";
    hsCell.font = FONT_NORMAL;
    hsCell.alignment = ALIGN_CENTER;
    hsCell.border = THIN_BORDER;
    // Origin
    const oriCell = ws.getCell(row, 4);
    oriCell.value = item.origin || "VN";
    oriCell.font = FONT_NORMAL;
    oriCell.alignment = ALIGN_CENTER;
    oriCell.border = THIN_BORDER;
    // Quantity
    const qtyCell = ws.getCell(row, 5);
    qtyCell.value = Number(item.quantity) || 0;
    qtyCell.font = FONT_NORMAL;
    qtyCell.alignment = ALIGN_CENTER;
    qtyCell.border = THIN_BORDER;
    // Unit
    const unitCell = ws.getCell(row, 6);
    unitCell.value = item.unit || "PCE";
    unitCell.font = FONT_NORMAL;
    unitCell.alignment = ALIGN_CENTER;
    unitCell.border = THIN_BORDER;
    // U.Price
    const priceCell = ws.getCell(row, 7);
    priceCell.value = Number(item.unitPriceUsd) || 0;
    priceCell.font = FONT_NORMAL;
    priceCell.alignment = ALIGN_RIGHT;
    priceCell.border = THIN_BORDER;
    priceCell.numFmt = "#,##0.00";
    // Amount = E * G
    const amtCell = ws.getCell(row, 8);
    amtCell.value = { formula: `E${row}*G${row}` };
    amtCell.font = FONT_NORMAL;
    amtCell.alignment = ALIGN_RIGHT;
    amtCell.border = THIN_BORDER;
    amtCell.numFmt = "#,##0.00";

    row++;
  });
  const goodsLastRow = row - 1;

  // ─── TOTAL row ────────────────────────────────────
  ws.getRow(row).height = 28;
  const totalLabelCell = ws.getCell(row, 2);
  totalLabelCell.value = "TOTAL";
  totalLabelCell.font = FONT_BOLD;
  totalLabelCell.alignment = ALIGN_LEFT;
  totalLabelCell.border = THIN_BORDER;
  // Border on empty cells
  for (const c of [1, 3, 4, 5, 6]) {
    ws.getCell(row, c).border = THIN_BORDER;
  }
  // SUM formulas
  if (items.length > 0) {
    const sumFCell = ws.getCell(row, 7);
    sumFCell.value = { formula: `SUM(G${goodsFirstRow}:G${goodsLastRow})` };
    sumFCell.font = FONT_BOLD;
    sumFCell.alignment = ALIGN_RIGHT;
    sumFCell.border = THIN_BORDER;
    sumFCell.numFmt = "#,##0.00";

    const sumHCell = ws.getCell(row, 8);
    sumHCell.value = { formula: `SUM(H${goodsFirstRow}:H${goodsLastRow})` };
    sumHCell.font = FONT_BOLD;
    sumHCell.alignment = ALIGN_RIGHT;
    sumHCell.border = THIN_BORDER;
    sumHCell.numFmt = "#,##0.00";
  } else {
    ws.getCell(row, 7).border = THIN_BORDER;
    ws.getCell(row, 8).border = THIN_BORDER;
  }
  row++;

  // ─── Footer: cartons + gross weight ───────────────
  ws.getRow(row).height = 24;
  ws.getCell(row, 2).value =
    shipment.pcs != null && shipment.pcs > 0
      ? `1.   Total carton: ${shipment.pcs} CTNS`
      : "1.   Total carton:";
  ws.getCell(row, 2).font = FONT_BOLD;
  row++;

  ws.getRow(row).height = 24;
  ws.getCell(row, 2).value =
    shipment.kg != null && shipment.kg > 0
      ? `2.   Total gross weight: ${shipment.kg} KGM`
      : "2.   Total gross weight:";
  ws.getCell(row, 2).font = FONT_BOLD;

  const lastRow = row;

  // ─── Print area ───────────────────────────────────
  ws.pageSetup.printArea = `A1:H${lastRow}`;

  return { wb, invoiceNo, lastRow };
}

function estimateRowHeight(description: string): number {
  const len = (description ?? "").length;
  if (len <= 30) return 24;
  if (len <= 60) return 36;
  if (len <= 100) return 48;
  return 60;
}
