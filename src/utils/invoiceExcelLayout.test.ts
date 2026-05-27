import { describe, expect, it } from "vitest";
import {
  autoFitInvoiceRowHeight,
  autoFitInvoiceRowHeightFromSpecs,
  DESCRIPTION_COL_WIDTH,
  estimateGoodsDescriptionRowHeight,
  estimateWrappedRowHeight,
  getInvoiceFixedColumnWidths,
  INVOICE_FIXED_COLUMN_WIDTHS,
  INVOICE_SHEET_COL_COUNT,
  rowHeightForWrappedText,
} from "./invoiceExcelLayout.ts";

const LONG_DESC =
  "BÁNH TRÁNG ĐAI ĐIÊU. NSX: T03/2026, HSD T03/2027. Xuất xứ Việt Nam, hàng mới nguyên kiện, không tem phụ, không quà tặng kèm.";

describe("invoiceExcelLayout", () => {
  it("độ rộng cột cố định A–J theo layout", () => {
    expect(getInvoiceFixedColumnWidths()).toEqual([...INVOICE_FIXED_COLUMN_WIDTHS]);
    expect(INVOICE_FIXED_COLUMN_WIDTHS[1]).toBe(34);
    expect(INVOICE_FIXED_COLUMN_WIDTHS.slice(2)).toEqual([10, 7, 12, 5, 13, 8, 9.01, 12]);
  });

  it("chiều cao hàng tăng theo nội dung wrap ở cột B (34)", () => {
    const short = rowHeightForWrappedText("TEST", DESCRIPTION_COL_WIDTH);
    const long = rowHeightForWrappedText(LONG_DESC, DESCRIPTION_COL_WIDTH);
    expect(long).toBeGreaterThan(short);
    expect(estimateGoodsDescriptionRowHeight(LONG_DESC, DESCRIPTION_COL_WIDTH)).toBe(long);
    expect(estimateWrappedRowHeight(LONG_DESC, DESCRIPTION_COL_WIDTH)).toBe(long);
  });

  it("autoFitInvoiceRowHeight — lấy max chiều cao các ô trong hàng", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("t");
    const widths = getInvoiceFixedColumnWidths();
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    ws.getCell(1, 2).value = LONG_DESC;
    ws.getCell(1, 2).alignment = { wrapText: true, vertical: "top", horizontal: "left" };
    ws.getCell(1, 6).value = "CARTONBOX";
    ws.getCell(1, 6).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };

    const height = autoFitInvoiceRowHeight(ws, 1, widths);
    expect(height).toBeGreaterThan(rowHeightForWrappedText("TEST", DESCRIPTION_COL_WIDTH));
    expect(ws.getRow(1).height).toBe(height);
  });

  it("merge B:J không phình chiều cao title", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("t");
    const widths = getInvoiceFixedColumnWidths();
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    const titleSpan = widths.slice(1).reduce((sum, w) => sum + w, 0);
    ws.mergeCells(1, 2, 1, INVOICE_SHEET_COL_COUNT);
    ws.getCell(1, 2).value = "NONCOMMERCIAL INVOICE";
    ws.getCell(1, 2).font = { size: 18 };

    const height = autoFitInvoiceRowHeightFromSpecs(
      ws,
      1,
      [{ col: 2, width: titleSpan, fontSize: 18 }],
      { minHeight: 28, maxHeight: 36 },
    );
    expect(height).toBeLessThanOrEqual(36);
    expect(height).toBeGreaterThanOrEqual(28);
  });
});
