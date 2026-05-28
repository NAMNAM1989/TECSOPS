import JSZip from "jszip";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import { roundDeclarationKg, totalsForInvoice } from "../types/invoiceItem";
import { buildInvoiceExportPayload } from "../export/builders/buildInvoiceExportPayload";
import { fetchInvoiceExportBuffer } from "../export/api/invoiceExportClient";
import { buildShipmentInvoiceXlsxBuffer } from "./exportShipmentInvoiceExcel";
import {
  invoiceExportFileName,
  invoiceExportZipFileName,
} from "./shipmentInvoiceCore";

function zipFileName(shipment: Shipment, ext: "xlsx" | "pdf"): string {
  return invoiceExportZipFileName(shipment.awb ?? "", ext);
}

function buildDeclExportOpts(
  shipment: Shipment,
  decl: InvoiceDeclaration,
  total: number
) {
  const declTotals = totalsForInvoice(decl.items);
  return {
    items: decl.items,
    declarationSeq: decl.seq,
    totalDeclarations: total,
    footerPcs: decl.targetPcs ?? shipment.pcs,
    footerKg: roundDeclarationKg(decl.targetKg ?? declTotals.totalGrossKg),
  };
}

export async function downloadAllDeclarationsExcelZip(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  declarations: readonly InvoiceDeclaration[]
): Promise<void> {
  if (declarations.length === 0) {
    window.alert("Không có tờ khai để xuất.");
    return;
  }
  const zip = new JSZip();
  const total = declarations.length;
  for (const decl of declarations) {
    const opts = buildDeclExportOpts(shipment, decl, total);
    const { buffer } = await buildShipmentInvoiceXlsxBuffer(shipment, directory, opts);
    zip.file(
      invoiceExportFileName(shipment.awb ?? "", decl.seq, total, "xlsx"),
      buffer,
    );
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName(shipment, "xlsx");
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadAllDeclarationsPdfZip(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[],
  declarations: readonly InvoiceDeclaration[]
): Promise<void> {
  if (declarations.length === 0) {
    window.alert("Không có tờ khai để xuất.");
    return;
  }
  const zip = new JSZip();
  const total = declarations.length;
  for (const decl of declarations) {
    const opts = buildDeclExportOpts(shipment, decl, total);
    const payload = buildInvoiceExportPayload(shipment, directory, opts);
    const pdfBuffer = await fetchInvoiceExportBuffer(payload, "pdf");
    zip.file(
      invoiceExportFileName(shipment.awb ?? "", decl.seq, total, "pdf"),
      pdfBuffer,
    );
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName(shipment, "pdf");
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
