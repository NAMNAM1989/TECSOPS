/** Giữ đồng bộ với src/utils/shipmentInvoiceCore.ts */

export function invoiceAwbFilePart(awb) {
  const digits = String(awb ?? "").replace(/\D/g, "");
  if (digits) return digits;
  const cleaned = String(awb ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\s]+/g, "_")
    .slice(0, 80);
  return cleaned || "AWB";
}

export function invoiceExportFileName(awb, declarationSeq = 1, totalDeclarations = 1, ext) {
  const awbPart = invoiceAwbFilePart(awb);
  if (totalDeclarations > 1) {
    const seq = String(declarationSeq).padStart(2, "0");
    return `invoice_${awbPart}_${seq}.${ext}`;
  }
  return `invoice_${awbPart}.${ext}`;
}
