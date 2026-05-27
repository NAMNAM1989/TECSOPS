import type { Worksheet } from "exceljs";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { INVOICE_TEMPLATE } from "./invoiceTemplateLayout";
import { buildShipmentCneeBodyLines } from "./shipmentCneeCopyBlock";
import { buildInvoiceNumber, formatInvoiceSheetDate } from "./shipmentInvoiceCore";
import {
  cneeRowHeightForLine,
  ensureCellWrapText,
  goodsRowHeightForDescription,
} from "./invoiceGoodsRowHeight";

const T = INVOICE_TEMPLATE;
const GOODS_FIRST = T.goods.firstRow;
const TEMPLATE_SLOTS = T.goods.templateRowCount;
const STYLE_ROW_FOR_INSERT = GOODS_FIRST + TEMPLATE_SLOTS - 1;

/** Cột ghi giá trị (bỏ C — ô merge phụ của B:C). */
const GOODS_VALUE_COLS = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export type FillInvoiceWorksheetOptions = {
  items: InvoiceLineItem[];
  at?: Date;
};

export function findInvoiceTotalRow(ws: Worksheet): number {
  const max = (ws as Worksheet & { _rows?: unknown[] })._rows?.length ?? T.total.rowBase + 20;
  for (let r = GOODS_FIRST; r <= max; r++) {
    const v = ws.getCell(r, 1).value;
    if (String(v ?? "").trim().toUpperCase() === "TOTAL") return r;
  }
  return T.total.rowBase;
}

function clearGoodsRowValues(ws: Worksheet, row: number) {
  for (const c of GOODS_VALUE_COLS) {
    ws.getCell(row, c).value = null;
  }
}

function clearGoodsBlock(ws: Worksheet, rowCount: number) {
  for (let i = 0; i < rowCount; i++) {
    clearGoodsRowValues(ws, GOODS_FIRST + i);
  }
}

function writeGoodsItem(ws: Worksheet, row: number, index: number, item: InvoiceLineItem) {
  const desc = item.description ?? "";
  ws.getCell(row, 1).value = index + 1;
  const descCell = ws.getCell(row, T.goods.descriptionCol);
  descCell.value = desc;
  ensureCellWrapText(descCell, "middle");
  ws.getRow(row).height = goodsRowHeightForDescription(ws, desc);

  ws.getCell(row, 4).value = item.hsCode || "";
  ws.getCell(row, 5).value = item.origin || "VN";
  ws.getCell(row, 6).value = Number(item.quantity) || 0;
  ws.getCell(row, 7).value = item.unit || "PCE";
  ws.getCell(row, 8).value = Number(item.unitPriceUsd) || 0;
  ws.getCell(row, 9).value = { formula: `F${row}*H${row}` };
  ws.getCell(row, 10).value = Number(item.kgPerUnit) || 0;
  ws.getCell(row, 11).value = { formula: `J${row}*F${row}` };
}

function updateTotalFormulas(ws: Worksheet, totalRow: number, firstGoods: number, lastGoods: number) {
  if (lastGoods < firstGoods) {
    ws.getCell(totalRow, 7).value = null;
    ws.getCell(totalRow, 9).value = null;
    ws.getCell(totalRow, 11).value = null;
    return;
  }
  ws.getCell(totalRow, 7).value = { formula: `SUM(G${firstGoods}:G${lastGoods})` };
  ws.getCell(totalRow, 9).value = { formula: `SUM(I${firstGoods}:I${lastGoods})` };
  ws.getCell(totalRow, 11).value = { formula: `SUM(K${firstGoods}:K${lastGoods})` };
}

function writeFooterValues(
  ws: Worksheet,
  totalRow: number,
  pcs: number | null | undefined,
  kg: number | null | undefined
) {
  ws.getCell(totalRow + 1, 3).value =
    pcs != null && pcs > 0 ? `${pcs} CTNS` : null;
  ws.getCell(totalRow + 2, 3).value =
    kg != null && kg > 0 ? `${kg} KGM` : null;
}

/** Chỉ đặt vùng in — không đổi scale/margin của mẫu. */
function setPrintAreaOnly(ws: Worksheet, lastRow: number) {
  ws.pageSetup.printArea = `A1:K${lastRow}`;
}

function writeCneeLines(ws: Worksheet, lines: string[]) {
  const { firstRow, lastRow, col } = T.cnee;
  const maxLines = lastRow - firstRow + 1;
  const trimmed = lines.map((l) => l.trim()).filter(Boolean).slice(0, maxLines);
  for (let i = 0; i < maxLines; i++) {
    const row = firstRow + i;
    const line = trimmed[i] ?? "";
    const cell = ws.getCell(row, col);
    cell.value = line || null;
    if (line) {
      ensureCellWrapText(cell, "top");
      ws.getRow(row).height = cneeRowHeightForLine(ws, line);
    }
  }
  for (let i = trimmed.length; i < maxLines; i++) {
    ws.getCell(firstRow + i, col).value = null;
  }
}

/**
 * Điền dữ liệu vào mẫu INV.xlsx — chỉ ghi giá trị/công thức, giữ nguyên style/merge của file mẫu.
 */
export function fillInvoiceWorksheetFromTemplate(
  ws: Worksheet,
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  options: FillInvoiceWorksheetOptions
): { invoiceNo: string; lastRow: number } {
  const at = options.at ?? new Date();
  const items = options.items;
  const n = items.length;
  const invoiceNo = buildInvoiceNumber(shipment, directory, at);
  const flight = (shipment.flight ?? "").trim().toUpperCase();

  ws.getCell(T.fields.invoiceNo).value = invoiceNo;
  ws.getCell(T.fields.date).value = formatInvoiceSheetDate(at);
  ws.getCell(T.fields.flight).value = flight || null;

  writeCneeLines(ws, buildShipmentCneeBodyLines(shipment, directory));

  if (n > TEMPLATE_SLOTS) {
    ws.duplicateRow(STYLE_ROW_FOR_INSERT, n - TEMPLATE_SLOTS, true);
  }

  const goodsSlots = Math.max(TEMPLATE_SLOTS, n);
  clearGoodsBlock(ws, goodsSlots);

  items.forEach((item, idx) => {
    writeGoodsItem(ws, GOODS_FIRST + idx, idx, item);
  });

  const totalRow = findInvoiceTotalRow(ws);
  const lastGoods = n > 0 ? GOODS_FIRST + n - 1 : GOODS_FIRST - 1;
  updateTotalFormulas(ws, totalRow, GOODS_FIRST, lastGoods);
  writeFooterValues(ws, totalRow, shipment.pcs, shipment.kg);

  const lastRow = totalRow + 2;
  setPrintAreaOnly(ws, lastRow);

  return { invoiceNo, lastRow };
}
