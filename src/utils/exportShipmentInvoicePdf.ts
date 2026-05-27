import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { buildShipmentInvoiceXlsxBuffer } from "./exportShipmentInvoiceExcel";
import { defaultInvoicePdfFileName } from "./shipmentInvoiceCore";
import type { BuildInvoiceOptions } from "./exportShipmentInvoiceExcel";
import { fetchShipmentInvoicePdfFromXlsx } from "./printServerApi";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function downloadShipmentInvoicePdf(
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
    const pdfBuffer = await fetchShipmentInvoicePdfFromXlsx({
      xlsxBase64: arrayBufferToBase64(buffer),
      invoiceNo,
      awb: shipment.awb ?? "",
    });
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = defaultInvoicePdfFileName(invoiceNo, shipment.awb ?? "");
    a.click();
  } catch (e) {
    console.error("[downloadShipmentInvoicePdf]", e);
    const msg = e instanceof Error ? e.message : "";
    const hint = /Excel|LibreOffice|COM|PDF/i.test(msg)
      ? "Cần Microsoft Excel (Windows) hoặc LibreOffice trên máy chạy server để in PDF từ mẫu."
      : /not found|404/i.test(msg)
        ? "Khởi động lại server (npm run dev)."
        : "Không tạo được PDF invoice.";
    window.alert(msg ? `${msg}\n\n${hint}` : hint);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
