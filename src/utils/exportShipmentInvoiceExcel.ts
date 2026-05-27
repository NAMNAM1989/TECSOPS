import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { INVOICE_TEMPLATE } from "./invoiceTemplateLayout";
import { fillInvoiceWorksheetFromTemplate } from "./shipmentInvoiceFill";
import { defaultInvoiceXlsxFileName } from "./shipmentInvoiceCore";

export {
  buildInvoiceNumber,
  formatInvoiceSheetDate,
  resolveCustomerCode,
} from "./shipmentInvoiceCore";

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type BuildInvoiceOptions = {
  items?: InvoiceLineItem[];
  at?: Date;
};

async function loadInvoiceTemplateWorkbook(): Promise<import("exceljs").Workbook> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  if (import.meta.env.MODE === "test") {
    const path = await import("node:path");
    const templatePath = path.join(
      process.cwd(),
      "public",
      "templates",
      "invoice",
      "INV.xlsx"
    );
    await wb.xlsx.readFile(templatePath);
    return wb;
  }

  const res = await fetch(INVOICE_TEMPLATE.url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Không tải được mẫu INV.xlsx (${res.status}). Chạy npm run sync:invoice-template.`
    );
  }
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

export async function buildShipmentInvoiceXlsxBuffer(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {}
): Promise<{ buffer: ArrayBuffer; invoiceNo: string }> {
  const items = options.items ?? shipment.invoiceItems ?? [];
  const wb = await loadInvoiceTemplateWorkbook();
  const ws = wb.getWorksheet(INVOICE_TEMPLATE.sheetName);
  if (!ws) {
    throw new Error(`Sheet "${INVOICE_TEMPLATE.sheetName}" không có trong mẫu INV.xlsx`);
  }

  const { invoiceNo } = fillInvoiceWorksheetFromTemplate(ws, shipment, directory, {
    items,
    at: options.at,
  });

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf as ArrayBuffer, invoiceNo };
}

export async function downloadShipmentInvoiceExcel(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {}
): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const { buffer, invoiceNo } = await buildShipmentInvoiceXlsxBuffer(
      shipment,
      directory,
      options
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
      e instanceof Error ? e.message : "Không tạo được file invoice Excel. Thử lại."
    );
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
