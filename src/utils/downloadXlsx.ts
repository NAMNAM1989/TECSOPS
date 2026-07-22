/** Helper tải file .xlsx từ buffer ExcelJS — dùng chung các exporter. */

export const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function awbForFilename(awb: string): string {
  return awb.replace(/[^\dA-Za-z-]+/g, "_").slice(0, 40) || "AWB";
}

/** Tải blob xlsx; luôn revoke object URL. */
export function downloadXlsxBuffer(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], { type: MIME_XLSX });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
