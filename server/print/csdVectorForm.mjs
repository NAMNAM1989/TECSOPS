import { mmToPt } from "./printMmUnits.mjs";

const LINE = 0.35;

function mm(doc, x, y, w, h) {
  doc.rect(mmToPt(x), mmToPt(y), mmToPt(w), mmToPt(h)).stroke();
}

function hline(doc, x1, x2, y) {
  doc.moveTo(mmToPt(x1), mmToPt(y)).lineTo(mmToPt(x2), mmToPt(y)).stroke();
}

function vline(doc, x, y1, y2) {
  doc.moveTo(mmToPt(x), mmToPt(y1)).lineTo(mmToPt(x), mmToPt(y2)).stroke();
}

function label(doc, fonts, text, x, y, w, size = 5.2) {
  doc.font(fonts.label).fontSize(size).fillColor("#000000");
  doc.text(text, mmToPt(x), mmToPt(y), { width: mmToPt(w), lineBreak: false });
}

/**
 * Vẽ form IATA CSD vector trên giấy trắng — pipeline giống AWB Editor (blank paper).
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ label: string; title: string }} fonts
 * @param {{ page_width_mm?: number }} page
 */
export function drawIataCsdVectorForm(doc, fonts, page) {
  const pageW = page.page_width_mm ?? 210;
  const L = 11;
  const R = pageW - 11;
  const W = R - L;
  const T = 42;
  const B = 287;

  doc.save();
  doc.lineWidth(LINE);
  doc.strokeColor("#000000");

  doc.font(fonts.title).fontSize(10.5).fillColor("#000000");
  doc.text("Consignment Security Declaration", mmToPt(L), mmToPt(14), {
    width: mmToPt(W),
    align: "center",
  });

  mm(doc, L, T, W, B - T);

  hline(doc, L, R, 52);
  vline(doc, 106, T, 52);
  label(
    doc,
    fonts,
    "Regulated Entity Category (RA, KC or AO) and Identifier (of the regulated party issuing the security status)",
    L + 1.5,
    T + 1.5,
    92,
    4.8
  );
  label(
    doc,
    fonts,
    "Unique Consignment Identifier (if AWB format is nnn-nnnnnnnn)",
    107.5,
    T + 1.5,
    90,
    4.8
  );

  hline(doc, L, R, 60);
  label(doc, fonts, "Contents of Consignment", L + 1.5, 52.5, 100, 4.8);
  label(doc, fonts, "Consolidation", L + 1.5, 68, 24, 4.8);

  hline(doc, L, R, 74);
  hline(doc, L, R, 81);
  vline(doc, 53, 74, 100);
  vline(doc, 69, 74, 100);
  vline(doc, 106, 74, 100);
  label(doc, fonts, "Origin", L + 1.5, 74.5, 20, 4.8);
  label(doc, fonts, "Destination", 54.5, 74.5, 14, 4.8);
  label(doc, fonts, "Transfer/Transit points (if known)", 70.5, 74.5, 34, 4.8);

  hline(doc, L, R, 100);
  hline(doc, L, R, 103);
  label(doc, fonts, "Reasons for issuing the Security Status", 55, 100.5, 100, 4.8);
  vline(doc, 54, 103, 130);
  vline(doc, 97, 103, 130);
  vline(doc, 141, 103, 130);
  label(doc, fonts, "Security Status", L + 1.5, 103.5, 24, 4.8);
  label(doc, fonts, "Received from (codes)", 55.5, 103.5, 40, 4.8);
  label(doc, fonts, "Screening Method (codes)", 98.5, 103.5, 40, 4.8);
  label(doc, fonts, "Grounds for Exemption (codes)", 142.5, 103.5, 55, 4.8);

  hline(doc, L, R, 130);
  label(doc, fonts, "Other Screening Method(s) (if applicable)", L + 1.5, 130.5, 120, 4.8);

  hline(doc, L, R, 149);
  vline(doc, 120, 149, 163);
  label(doc, fonts, "Security Status Issued by", L + 1.5, 149.5, 50, 4.8);
  label(doc, fonts, "Name of Person or Employee ID", L + 1.5, 156, 90, 4.5);
  label(doc, fonts, "Security Status Issued on", 121.5, 149.5, 50, 4.8);
  label(doc, fonts, "Date (ddmmmyy)", 121.5, 156, 30, 4.5);
  label(doc, fonts, "Time (tttt)", 158, 156, 24, 4.5);

  hline(doc, L, R, 163);
  label(
    doc,
    fonts,
    "Regulated Entity Category (RA, KC or AO) and Identifier (of any regulated party who has accepted the security status given to a consignment by another regulated party)",
    L + 1.5,
    163.5,
    W - 3,
    4.6
  );

  hline(doc, L, R, 183);
  label(doc, fonts, "Additional Security Information", L + 1.5, 183.5, 80, 4.8);

  doc.restore();
}
