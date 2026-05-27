import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { buildInvoiceWorkbook } from "./shipmentInvoiceFill";
import { defaultInvoiceXlsxFileName } from "./shipmentInvoiceCore";

export {
  buildInvoiceNumber,
  formatInvoiceFlightLine,
  formatInvoiceSheetDate,
  resolveCustomerCode,
} from "./shipmentInvoiceCore";

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type BuildInvoiceOptions = {
  items?: InvoiceLineItem[];
  at?: Date;
};

export async function buildShipmentInvoiceXlsxBuffer(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {},
): Promise<{ buffer: ArrayBuffer; invoiceNo: string }> {
  const items = options.items ?? shipment.invoiceItems ?? [];
  const ExcelJS = (await import("exceljs")).default;

  const { wb, invoiceNo } = buildInvoiceWorkbook(
    ExcelJS,
    shipment,
    directory,
    { items, at: options.at },
  );

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf as ArrayBuffer, invoiceNo };
}

export async function downloadShipmentInvoiceExcel(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {},
): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const { buffer, invoiceNo } = await buildShipmentInvoiceXlsxBuffer(
      shipment,
      directory,
      options,
    );
    const blob = new Blob([buffer], { type: MIME_XLSX });
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = defaultInvoiceXlsxFileName(invoiceNo, shipment.awb ?? "");
    a.click();
  } catch (e) {
    console.error("[downloadShipmentInvoiceExcel]", e);
    window.alert(
      e instanceof Error ? e.message : "Không tạo được file invoice Excel. Thử lại.",
    );
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
