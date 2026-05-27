/**
 * Bố cục mẫu `public/templates/invoice/INV.xlsx` (sheet NNL).
 * Cập nhật khi đổi file mẫu — chạy `npm run sync:invoice-template`.
 */
export const INVOICE_TEMPLATE = {
  url: "/templates/invoice/INV.xlsx",
  sheetName: "NNL",
  /** Ô nhập dữ liệu động (nhãn giữ ở cột F). */
  fields: {
    invoiceNo: "G3",
    date: "G4",
    flight: "G5",
  },
  /** THE CNEE: hàng 8 — chỉ ghi nội dung từ hàng 9, cột A (merge A:C). */
  cnee: {
    headerRow: 8,
    firstRow: 9,
    lastRow: 12,
    col: 1,
  },
  /** Bảng hàng — để trống khi xuất (giữ header 14–15). Có thể nở thêm dòng nếu items > 10. */
  goods: {
    headerFirstRow: 14,
    headerLastRow: 15,
    firstRow: 16,
    /** Số dòng có sẵn trong template (16..25). */
    templateRowCount: 10,
    firstCol: 1,
    lastCol: 11,
    /** Mô tả merge B:C — chỉ xóa cột B (ô master). */
    descriptionCol: 2,
    /** Style mẫu cho từng cột khi insert dòng mới (lấy từ row 25). */
    styleByCol: {
      A: "8",
      B: "46",
      C: "47",
      D: "9",
      E: "8",
      F: "25",
      G: "22",
      H: "23",
      I: "37",
      J: "26",
      K: "38",
    } as Record<string, string>,
    rowHeight: 47.25,
  },
  total: {
    rowBase: 26,
    /** Cột chứa formula SUM (G, I, K). */
    sumCols: ["G", "I", "K"] as const,
  },
  footer: {
    cartonRowBase: 27,
    grossWeightRowBase: 28,
    cartonValueCol: "C",
    grossWeightValueCol: "C",
  },
  print: {
    lastRowBase: 28,
    phantomLastRow: 151,
    printAreaBase: "A1:K28",
  },
} as const;

export type InvoiceTemplateLayout = typeof INVOICE_TEMPLATE;
