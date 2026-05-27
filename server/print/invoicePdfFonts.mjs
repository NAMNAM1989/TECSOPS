import fs from "node:fs";
import path from "node:path";

/**
 * Đăng ký Times New Roman (hỗ trợ tiếng Việt) cho PDFKit.
 * @param {import('pdfkit').PDFDocument} doc
 * @returns {boolean}
 */
export function registerInvoicePdfFonts(doc) {
  const win = process.env.WINDIR || "C:\\Windows";
  const candidates = {
    regular: [
      path.join(win, "Fonts", "times.ttf"),
      path.join(win, "Fonts", "Times.TTF"),
    ],
    bold: [
      path.join(win, "Fonts", "timesbd.ttf"),
      path.join(win, "Fonts", "Timesbd.TTF"),
    ],
  };

  const regular = candidates.regular.find((p) => fs.existsSync(p));
  const bold = candidates.bold.find((p) => fs.existsSync(p));
  if (!regular) return false;

  doc.registerFont("Times-Roman", regular);
  doc.registerFont("Times-Bold", bold || regular);
  return true;
}
