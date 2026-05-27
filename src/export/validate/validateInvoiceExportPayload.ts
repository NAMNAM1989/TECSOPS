import type { InvoiceExportPayload } from "../contracts/invoiceExportPayload";
import { INVOICE_EXPORT_PAYLOAD_VERSION } from "../contracts/invoiceExportPayload";

export type InvoiceExportValidation = {
  ok: boolean;
  errors: string[];
};

export function validateInvoiceExportPayload(raw: unknown): InvoiceExportValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Payload không hợp lệ."] };
  }
  const p = raw as Partial<InvoiceExportPayload>;
  if (p.version !== INVOICE_EXPORT_PAYLOAD_VERSION) {
    errors.push(`version phải là ${INVOICE_EXPORT_PAYLOAD_VERSION}.`);
  }
  if (!p.meta?.invoiceNo?.trim()) errors.push("Thiếu meta.invoiceNo.");
  if (!Array.isArray(p.lines)) errors.push("Thiếu lines.");
  if (p.lines && p.lines.some((l) => !String(l.description ?? "").trim() && l.quantity > 0)) {
    errors.push("Có dòng thiếu mô tả hàng.");
  }
  if (p.footer && p.footer.grossKg != null && p.footer.grossKg < 0) {
    errors.push("footer.grossKg không hợp lệ.");
  }
  return { ok: errors.length === 0, errors };
}
