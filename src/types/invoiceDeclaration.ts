import type { InvoiceLineItem } from "./invoiceItem";

/** Một tờ khai / invoice riêng trong cùng lô hàng. */
export interface InvoiceDeclaration {
  id: string;
  /** Nhãn hiển thị, ví dụ "Tờ 2/5". */
  label: string;
  /** Thứ tự 1-based — dùng cho hậu tố Invoice No (-01, -02…). */
  seq: number;
  items: InvoiceLineItem[];
  /** Mục tiêu kiện cho tờ này (gợi ý khi chia lô). */
  targetPcs?: number | null;
  /** Mục tiêu kg cho tờ này. */
  targetKg?: number | null;
}

export type HqInvoiceSavePayload = {
  invoiceItems: InvoiceLineItem[];
  invoiceDeclarations: InvoiceDeclaration[];
};
