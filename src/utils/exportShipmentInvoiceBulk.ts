import JSZip from "jszip";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceDeclaration } from "../types/invoiceDeclaration";
import { roundDeclarationKg, totalsForInvoice } from "../types/invoiceItem";
import { buildInvoiceExportPayload } from "../export/builders/buildInvoiceExportPayload";
import { fetchInvoiceExportBuffer } from "../export/api/invoiceExportClient";
import { buildShipmentInvoiceXlsxBuffer } from "./exportShipmentInvoiceExcel";
import { sanitizeInvoiceFilePart } from "./shipmentInvoiceCore";

function zipFileName(shipment: Shipment, ext: "xlsx" | "pdf"): string {
  const awb = sanitizeInvoiceFilePart((shipment.awb ?? "AWB").replace(/\s+/g, ""));
  return `INV_${awb}_ALL_${ext}.zip`;
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
    const { buffer, invoiceNo } = await buildShipmentInvoiceXlsxBuffer(shipment, directory, opts);
    const name = sanitizeInvoiceFilePart(invoiceNo) || `to-${decl.seq}`;
    zip.file(`INV_${name}.xlsx`, buffer);
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
    const name = sanitizeInvoiceFilePart(payload.meta.invoiceNo) || `to-${decl.seq}`;
    zip.file(`INV_${name}.pdf`, pdfBuffer);
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
