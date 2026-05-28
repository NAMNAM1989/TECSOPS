import PDFDocument from "pdfkit";
import { registerInvoicePdfFonts } from "./invoicePdfFonts.mjs";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 24;
const MARGIN_R = 8;
const MARGIN_T = 54;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

/** Tỷ lệ cột khớp INV.xlsx (đơn vị Excel width). */
const COL_W = [4.18, 28, 34.45, 16, 9.27, 12.18, 11.54, 10.82, 11.18, 9.27, 9.27];
const COL_SUM = COL_W.reduce((a, b) => a + b, 0);

const GREEN = "#00B050";
const BLACK = "#000000";

const SHIPPER_LINES = [
  "THE SHIPPER:",
  "CÔNG TY TNHH NAM NAM LOGISTICS",
  "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT",
  "THÀNH PHỐ HỒ CHÍ MINH",
];

function colWidthsPt() {
  const scale = CONTENT_W / COL_SUM;
  return COL_W.map((w) => w * scale);
}

function colX(widths, index) {
  let x = MARGIN_L;
  for (let i = 0; i < index; i++) x += widths[i];
  return x;
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v));
}

/**
 * @param {{
 *   invoiceNo: string;
 *   dateStr: string;
 *   flight: string;
 *   cneeLines: string[];
 *   items: object[];
 *   pcs: number | null;
 *   kg: number | null;
 *   awb: string;
 * }} payload
 * @returns {Promise<Buffer>}
 */
export function generateShipmentInvoicePdfBuffer(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: 0,
      autoFirstPage: true,
      info: { Title: "NONCOMMERCIAL INVOICE & PACKING LIST", Creator: "TECSOPS" },
    });
    registerInvoicePdfFonts(doc);

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const widths = colWidthsPt();
    let y = MARGIN_T;

    doc.font("Times-Bold").fontSize(18).fillColor(BLACK);
    doc.text("NONCOMMERCIAL INVOICE & PACKING LIST", MARGIN_L, y, {
      width: CONTENT_W,
      align: "center",
    });
    y += 32;

    doc.font("Times-Roman").fontSize(12);
    const metaX = MARGIN_L + CONTENT_W * 0.55;
    const metaW = CONTENT_W * 0.45;

    SHIPPER_LINES.forEach((line, i) => {
      doc.text(line, MARGIN_L, y, { width: CONTENT_W * 0.52 });
      const labels = ["InvoiceNo.:", "Date:", "Flight:", "NO PAYMENT"];
      doc.text(labels[i], metaX, y, { width: metaW * 0.35 });
      const values = [payload.invoiceNo, payload.dateStr, payload.flight, ""];
      if (values[i]) {
        doc.text(String(values[i]), metaX + metaW * 0.32, y, { width: metaW * 0.68 });
      }
      y += 16;
    });

    y += 6;
    doc.text("THE CNEE:", MARGIN_L, y);
    y += 14;
    for (const line of payload.cneeLines ?? []) {
      if (!String(line).trim()) continue;
      doc.text(String(line), MARGIN_L, y, { width: CONTENT_W * 0.55 });
      y += 14;
    }
    while (y < MARGIN_T + 155) y += 4;

    y += 8;
    const headerH = 36;
    const subHeaderH = 18;
    const tableTop = y;

    const drawCell = (row, col, w, h, text, opts = {}) => {
      const x = colX(widths, col);
      const yy = tableTop + row;
      doc.rect(x, yy, w, h).strokeColor(BLACK).lineWidth(0.5).stroke();
      doc
        .font(opts.bold ? "Times-Bold" : "Times-Roman")
        .fontSize(opts.fontSize ?? 10)
        .fillColor(opts.color ?? BLACK);
      doc.text(String(text ?? ""), x + 2, yy + 4, {
        width: w - 4,
        height: h - 6,
        align: opts.align ?? "left",
        lineBreak: true,
      });
    };

    const merged = (row, colStart, colSpan, wSum, h, text, opts) => {
      const x = colX(widths, colStart);
      const yy = tableTop + row;
      doc.rect(x, yy, wSum, h).stroke();
      doc
        .font(opts?.bold ? "Times-Bold" : "Times-Roman")
        .fontSize(opts?.fontSize ?? 10)
        .fillColor(opts?.color ?? BLACK);
      doc.text(String(text ?? ""), x + 2, yy + 4, {
        width: wSum - 4,
        align: opts?.align ?? "center",
      });
    };

    merged(0, 0, 1, widths[0], headerH + subHeaderH, "No", { bold: true, align: "center" });
    merged(0, 1, 2, widths[1] + widths[2], headerH + subHeaderH, "Depcription of goods", {
      bold: true,
      align: "center",
    });
    merged(0, 3, 1, widths[3], headerH + subHeaderH, "HS code", { bold: true, align: "center" });
    merged(0, 4, 1, widths[4], headerH + subHeaderH, "Origin", { bold: true, align: "center" });
    merged(0, 5, 1, widths[5], headerH + subHeaderH, "Quantity", { bold: true, align: "center" });
    merged(0, 6, 1, widths[6], headerH + subHeaderH, "Unit", { bold: true, align: "center" });
    merged(0, 9, 1, widths[9], headerH + subHeaderH, "Unit wt (kg)", { bold: true, align: "center" });
    merged(0, 10, 1, widths[10], headerH + subHeaderH, "Gross wt (kg)", {
      bold: true,
      align: "center",
    });

    const h8 = colX(widths, 7);
    const w8 = widths[7];
    const h9 = colX(widths, 8);
    const w9 = widths[8];
    doc.rect(h8, tableTop, w8, headerH).stroke();
    doc.rect(h9, tableTop, w9, headerH).stroke();
    doc.font("Times-Bold").fontSize(10).text("U.Price (FCA)", h8 + 2, tableTop + 10, {
      width: w8 - 4,
      align: "center",
    });
    doc.text("Amount", h9 + 2, tableTop + 10, { width: w9 - 4, align: "center" });
    doc.rect(h8, tableTop + headerH, w8, subHeaderH).stroke();
    doc.rect(h9, tableTop + headerH, w9, subHeaderH).stroke();
    doc.font("Times-Roman").text("USD", h8 + 2, tableTop + headerH + 4, {
      width: w8 - 4,
      align: "center",
    });
    doc.text("USD", h9 + 2, tableTop + headerH + 4, { width: w9 - 4, align: "center" });

    let rowY = headerH + subHeaderH;
    const rowH = 42;
    const items = Array.isArray(payload.items) ? payload.items : [];

    let sumQty = 0;
    let sumAmount = 0;
    let sumGross = 0;

    items.forEach((item, idx) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPriceUsd) || 0;
      const kg = Number(item.kgPerUnit) || 0;
      const amount = qty * price;
      const gross = qty * kg;
      sumQty += qty;
      sumAmount += amount;
      sumGross += gross;

      const cells = [
        [0, String(idx + 1), { align: "center" }],
        [1, item.description ?? "", { align: "left" }],
        [3, item.hsCode ?? "", { align: "center" }],
        [4, item.origin ?? "VN", { align: "center" }],
        [5, fmtQty(qty), { align: "right" }],
        [6, item.unit ?? "PCE", { align: "center" }],
        [7, fmtUsd(price), { align: "right" }],
        [8, fmtUsd(amount), { align: "right", color: GREEN }],
        [9, fmtUsd(kg), { align: "right" }],
        [10, fmtUsd(gross), { align: "right", color: GREEN }],
      ];

      if (cells[1][0] === 1) {
        const descW = widths[1] + widths[2];
        drawCell(rowY, 0, widths[0], rowH, cells[0][1], cells[0][2]);
        const x = colX(widths, 1);
        doc.rect(x, tableTop + rowY, descW, rowH).stroke();
        doc
          .font("Times-Roman")
          .fontSize(10)
          .fillColor(BLACK)
          .text(String(cells[1][1]), x + 2, tableTop + rowY + 4, {
            width: descW - 4,
            height: rowH - 6,
          });
        for (let c = 3; c <= 10; c++) {
          const cell = cells.find(([col]) => col === c);
          if (!cell) continue;
          drawCell(rowY, c, widths[c], rowH, cell[1], cell[2]);
        }
      }
      rowY += rowH;
    });

    const totalH = 34;
    const totalY = rowY;
    const totalLabelW = widths[0] + widths[1] + widths[2];
    doc.rect(colX(widths, 0), tableTop + totalY, totalLabelW, totalH).stroke();
    doc
      .font("Times-Bold")
      .fontSize(11)
      .text("TOTAL", colX(widths, 0) + 2, tableTop + totalY + 10, {
        width: totalLabelW - 4,
        align: "center",
      });

    for (let c = 3; c <= 10; c++) {
      doc.rect(colX(widths, c), tableTop + totalY, widths[c], totalH).stroke();
    }
    doc
      .font("Times-Bold")
      .fontSize(10)
      .text(fmtQty(sumQty), colX(widths, 6) + 2, tableTop + totalY + 10, {
        width: widths[6] - 4,
        align: "center",
      });
    doc.text(fmtUsd(sumAmount), colX(widths, 8) + 2, tableTop + totalY + 10, {
      width: widths[8] - 4,
      align: "center",
    });
    doc.fillColor(GREEN).text(fmtUsd(sumGross), colX(widths, 10) + 2, tableTop + totalY + 10, {
      width: widths[10] - 4,
      align: "center",
    });
    doc.fillColor(BLACK);

    y = tableTop + totalY + totalH + 12;
    const carton =
      payload.pcs != null && Number(payload.pcs) > 0 ? `${payload.pcs} CTNS` : "";
    const kgm = payload.kg != null && Number(payload.kg) > 0 ? `${payload.kg} KGM` : "";

    doc.font("Times-Bold").fontSize(12);
    doc.text("1.   Total carton:", MARGIN_L, y);
    doc.font("Times-Roman").text(carton, MARGIN_L + 120, y);
    y += 22;
    doc.font("Times-Bold").text("2.   Total gross weight:", MARGIN_L, y);
    doc.font("Times-Roman").text(kgm, MARGIN_L + 120, y);

    doc.end();
  });
}
