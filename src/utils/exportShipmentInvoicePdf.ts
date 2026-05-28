import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { buildInvoiceExportPayload } from "../export/builders/buildInvoiceExportPayload";
import { fetchInvoiceExportBuffer } from "../export/api/invoiceExportClient";
import { defaultInvoicePdfFileName } from "./shipmentInvoiceCore";
import type { BuildInvoiceOptions } from "./exportShipmentInvoiceExcel";

export async function buildShipmentInvoicePdfBuffer(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {}
): Promise<ArrayBuffer> {
  const items = options.items ?? shipment.invoiceItems ?? [];
  const payload = buildInvoiceExportPayload(shipment, directory, { ...options, items });
  return fetchInvoiceExportBuffer(payload, "pdf");
}

export async function downloadShipmentInvoicePdf(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {}
): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const items = options.items ?? shipment.invoiceItems ?? [];
    const payload = buildInvoiceExportPayload(shipment, directory, { ...options, items });
    const pdfBuffer = await fetchInvoiceExportBuffer(payload, "pdf");
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = defaultInvoicePdfFileName(
      shipment.awb ?? payload.meta.awb,
      payload.meta.declarationSeq,
      payload.meta.totalDeclarations,
    );
    a.click();
  } catch (e) {
    console.error("[downloadShipmentInvoicePdf]", e);
    const msg = e instanceof Error ? e.message : "";
    const hint = /playwright|chromium/i.test(msg)
      ? "Server cần Chromium (npx playwright install chromium)."
      : /not found|404/i.test(msg)
        ? "Khởi động lại server (npm run dev)."
        : "Không tạo được PDF invoice.";
    window.alert(msg ? `${msg}\n\n${hint}` : hint);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
