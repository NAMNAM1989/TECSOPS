import type { Worksheet } from "exceljs";
import { INVOICE_TEMPLATE } from "./invoiceTemplateLayout";

const MIN_GOODS_ROW_HEIGHT = INVOICE_TEMPLATE.goods.rowHeight;
/** ~pt mỗi dòng text khi wrap (Times 12pt + khoảng cách dòng). */
const PT_PER_LINE = 15;
const ROW_PAD_PT = 6;

function mergedDescriptionWidthChars(ws: Worksheet): number {
  const wB = ws.getColumn(2).width ?? 28;
  const wC = ws.getColumn(3).width ?? 34.45;
  return wB + wC;
}

function mergedCneeWidthChars(ws: Worksheet): number {
  const wA = ws.getColumn(1).width ?? 4.18;
  const wB = ws.getColumn(2).width ?? 28;
  const wC = ws.getColumn(3).width ?? 34.45;
  return wA + wB + wC;
}

/** Ước lượng số dòng khi wrap trong Excel (đơn vị width cột). */
export function estimateWrappedLineCount(text: string, totalColWidth: number): number {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 1;
  const charsPerLine = Math.max(12, totalColWidth * 0.9);
  const segments = trimmed.split(/\r?\n/);
  let lines = 0;
  for (const seg of segments) {
    const len = seg.length;
    lines += Math.max(1, Math.ceil(len / charsPerLine));
  }
  return lines;
}

export function goodsRowHeightForDescription(ws: Worksheet, description: string): number {
  const lines = estimateWrappedLineCount(description, mergedDescriptionWidthChars(ws));
  const height = lines * PT_PER_LINE + ROW_PAD_PT;
  return Math.max(MIN_GOODS_ROW_HEIGHT, Math.min(height, 280));
}

export function cneeRowHeightForLine(ws: Worksheet, line: string): number {
  const lines = estimateWrappedLineCount(line, mergedCneeWidthChars(ws));
  const height = lines * PT_PER_LINE + 4;
  return Math.max(15.5, Math.min(height, 120));
}

/** Giữ wrapText trên ô master (mô tả / CNEE) để Excel tự xuống dòng đúng ô merge. */
export function ensureCellWrapText(
  cell: { alignment?: Partial<import("exceljs").Alignment> },
  vertical: "middle" | "top" = "middle"
) {
  cell.alignment = {
    ...cell.alignment,
    wrapText: true,
    vertical: cell.alignment?.vertical ?? vertical,
  };
}
