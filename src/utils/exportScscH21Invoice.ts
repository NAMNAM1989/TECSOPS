import type { H21InvoiceDocument } from "../../shared/scscH21InvoiceCore.d.ts";
import { formatH21InvoiceCneeDisplay } from "./h21InvoiceCneeFormat";
import { awbForFilename, downloadXlsxBuffer } from "./downloadXlsx";
import { escapeHtml } from "./printHtmlViaHiddenIframe";
import { printHtmlViaHiddenIframe } from "./printHtmlViaHiddenIframe";
import { parseH21SealDataUrl } from "./scscH21SealImage";

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "INV";
}

export function h21InvoiceFilename(doc: H21InvoiceDocument, awb: string): string {
  const base = doc.invoiceNo || awbForFilename(awb);
  return `INV_${safeFilenamePart(base)}.xlsx`;
}

const NAVY = "1B365D";
const NAVY_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${NAVY}` } };
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF3F4F6" } };
const TOTAL_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE8EEF5" } };
const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
const MEDIUM = { style: "medium" as const, color: { argb: `FF${NAVY}` } };

function font(opts: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {}) {
  return {
    name: "Calibri",
    bold: Boolean(opts.bold),
    italic: Boolean(opts.italic),
    size: opts.size ?? 10,
    color: opts.color ? { argb: opts.color } : { argb: "FF111827" },
  };
}

function applyRangeBorder(ws: { getCell: (addr: string) => { border: unknown } }, range: string) {
  const [a, b] = range.split(":");
  const start = a ?? "A1";
  const end = b ?? start;
  const startCol = start.replace(/\d/g, "").charCodeAt(0);
  const endCol = end.replace(/\d/g, "").charCodeAt(0);
  const startRow = Number(start.replace(/\D/g, ""));
  const endRow = Number(end.replace(/\D/g, ""));
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(`${String.fromCharCode(c)}${r}`);
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
  }
}

export async function buildScscH21InvoiceExcelBuffer(doc: H21InvoiceDocument): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  const ws = wb.addWorksheet("INV H21", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 0 }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: false,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
    },
    properties: { defaultRowHeight: 15 },
  });

  ws.columns = [
    { key: "no", width: 5 },
    { key: "desc", width: 46 },
    { key: "origin", width: 11 },
    { key: "qty", width: 8 },
    { key: "uom", width: 7 },
    { key: "kg", width: 12 },
    { key: "price", width: 11 },
    { key: "amt", width: 11 },
  ];

  const cnee = formatH21InvoiceCneeDisplay(doc.cnee);
  const cneeAddr = cnee.addressLines.join(", ");
  const cneeContact = [cnee.phoneLine, cnee.emailLine].filter(Boolean).join("  ·  ");

  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = doc.title;
  title.font = font({ bold: true, size: 16, color: `FF${NAVY}` });
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells("A2:H2");
  const sub = ws.getCell("A2");
  sub.value = "H21  ·  Non-commercial export  ·  Value for customs purpose only";
  sub.font = font({ size: 8, italic: true, color: "FF6B7280" });
  sub.alignment = { horizontal: "center" };
  ws.getRow(2).height = 14;

  ws.mergeCells("A3:D3");
  ws.getCell("A3").value = "THE SHIPPER";
  ws.getCell("A3").font = font({ bold: true, size: 8, color: "FF6B7280" });
  ws.mergeCells("E3:H3");
  ws.getCell("E3").value = "INVOICE";
  ws.getCell("E3").font = font({ bold: true, size: 8, color: "FF6B7280" });
  ws.getCell("E3").alignment = { horizontal: "right" };

  ws.mergeCells("A4:D4");
  ws.getCell("A4").value = doc.shipper.name || "—";
  ws.getCell("A4").font = font({ bold: true, size: 11 });
  ws.mergeCells("E4:H4");
  ws.getCell("E4").value = `No.  ${doc.invoiceNo || "—"}`;
  ws.getCell("E4").font = font({ bold: true, size: 11, color: `FF${NAVY}` });
  ws.getCell("E4").alignment = { horizontal: "right" };

  ws.mergeCells("A5:D5");
  ws.getCell("A5").value = doc.shipper.address || "";
  ws.getCell("A5").font = font({ size: 9 });
  ws.getCell("A5").alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells("E5:H5");
  ws.getCell("E5").value = `Date  ${doc.dateLabel || "—"}     Flight  ${doc.flightLabel || "—"}`;
  ws.getCell("E5").font = font({ size: 9 });
  ws.getCell("E5").alignment = { horizontal: "right" };

  ws.mergeCells("A6:D6");
  ws.getCell("A6").value = doc.shipper.phone || "";
  ws.getCell("A6").font = font({ size: 9 });
  ws.mergeCells("E6:H6");
  ws.getCell("E6").value = doc.paymentNote || "NO PAYMENT";
  ws.getCell("E6").font = font({ bold: true, size: 9, color: `FF${NAVY}` });
  ws.getCell("E6").alignment = { horizontal: "right" };
  ws.getRow(5).height = 28;

  ws.mergeCells("A8:H8");
  ws.getCell("A8").value = "THE CNEE";
  ws.getCell("A8").font = font({ bold: true, size: 8, color: "FF6B7280" });

  ws.mergeCells("A9:H9");
  ws.getCell("A9").value = cnee.nameLine || "—";
  ws.getCell("A9").font = font({ bold: true, size: 11 });

  ws.mergeCells("A10:H10");
  ws.getCell("A10").value = cneeAddr;
  ws.getCell("A10").font = font({ size: 9 });
  ws.getCell("A10").alignment = { wrapText: true, vertical: "top" };
  ws.getRow(10).height = cneeAddr.length > 70 ? 28 : 16;

  ws.mergeCells("A11:H11");
  ws.getCell("A11").value = cneeContact;
  ws.getCell("A11").font = font({ size: 9, color: "FF374151" });

  const hdr = 13;
  const headers = [
    "No",
    "Description of goods",
    "Xuất xứ",
    "Qty",
    "ĐVT",
    "Weight (KGM)",
    "U.Price FCA",
    "Amount",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(hdr, i + 1);
    cell.value = h;
    cell.font = font({ bold: true, size: 8, color: "FFFFFFFF" });
    cell.fill = NAVY_FILL;
    cell.alignment = { horizontal: i === 1 ? "left" : "center", vertical: "middle", wrapText: true };
  });
  ws.getRow(hdr).height = 22;

  const usd = hdr + 1;
  ws.mergeCells(`A${usd}:F${usd}`);
  ws.getCell(`A${usd}`).value = "";
  ws.getCell(`G${usd}`).value = "USD";
  ws.getCell(`H${usd}`).value = "USD";
  for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"] as const) {
    const cell = ws.getCell(`${col}${usd}`);
    cell.font = font({ bold: true, size: 7, color: "FF6B7280" });
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" };
  }
  ws.getRow(usd).height = 12;

  let row = usd + 1;
  const lines = doc.lines.length ? doc.lines : [];
  if (!lines.length) {
    ws.mergeCells(`A${row}:H${row}`);
    ws.getCell(`A${row}`).value = "No line items";
    ws.getCell(`A${row}`).font = font({ italic: true, size: 9, color: "FF9CA3AF" });
    ws.getCell(`A${row}`).alignment = { horizontal: "center" };
    row += 1;
  } else {
    for (const line of lines) {
      const r = ws.getRow(row);
      r.values = [
        line.no,
        line.description,
        line.origin,
        line.quantity,
        line.uom,
        line.weightKg,
        line.unitPrice,
        line.amount,
      ];
      r.font = font({ size: 8 });
      r.alignment = { vertical: "middle", wrapText: true };
      r.height = Math.min(36, 14 + Math.floor(String(line.description || "").length / 55) * 10);
      ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(row, 3).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(row, 4).alignment = { horizontal: "right", vertical: "middle" };
      ws.getCell(row, 5).alignment = { horizontal: "center", vertical: "middle" };
      ws.getCell(row, 6).alignment = { horizontal: "right", vertical: "middle" };
      ws.getCell(row, 6).numFmt = "0.000";
      ws.getCell(row, 7).alignment = { horizontal: "right", vertical: "middle" };
      ws.getCell(row, 7).numFmt = "0.00";
      ws.getCell(row, 8).alignment = { horizontal: "right", vertical: "middle" };
      ws.getCell(row, 8).numFmt = "0.00";
      if (row % 2 === 0) {
        for (let c = 1; c <= 8; c++) {
          ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        }
      }
      row += 1;
    }
  }
  const dataEnd = row - 1;
  applyRangeBorder(ws, `A${hdr}:H${dataEnd}`);

  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = "TOTAL";
  ws.getCell(`A${row}`).font = font({ bold: true, size: 9, color: `FF${NAVY}` });
  ws.getCell(`A${row}`).alignment = { horizontal: "right", vertical: "middle" };
  ws.getCell(`F${row}`).value = doc.footer.linesKg;
  ws.getCell(`F${row}`).numFmt = "0.000";
  ws.getCell(`H${row}`).value = doc.footer.lineAmount;
  ws.getCell(`H${row}`).numFmt = "0.00";
  for (let c = 1; c <= 8; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = TOTAL_FILL;
    cell.font = font({ bold: true, size: 9, color: `FF${NAVY}` });
    cell.border = { top: MEDIUM, left: THIN, bottom: MEDIUM, right: THIN };
    cell.alignment = {
      horizontal: c >= 6 || c === 1 ? "right" : "center",
      vertical: "middle",
    };
  }
  row += 2;

  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = `1.  Total carton:  ${doc.footer.totalCartonPkgs} PKGS`;
  ws.getCell(`A${row}`).font = font({ size: 10 });
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = `2.  Total gross weight:  ${doc.footer.grossKg} KGM`;
  ws.getCell(`A${row}`).font = font({ size: 10 });
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = doc.customsNote;
  ws.getCell(`A${row}`).font = font({ italic: true, size: 8, color: "FF6B7280" });
  row += 2;

  const seal = parseH21SealDataUrl(doc.shipper.sealImageData);
  if (seal && seal.extension !== "webp") {
    const imageId = wb.addImage({
      base64: seal.base64,
      extension: seal.extension,
    });
    ws.addImage(imageId, {
      tl: { col: 5.2, row: row - 1 },
      ext: { width: 140, height: 140 },
      editAs: "oneCell",
    });
    row += 8;
  }

  ws.pageSetup.printArea = `A1:H${row}`;
  ws.headerFooter.oddFooter = `&L${doc.invoiceNo || ""}&CPage &P of &N&R${doc.paymentNote || ""}`;

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export async function downloadScscH21InvoiceExcel(
  doc: H21InvoiceDocument,
  awb: string
): Promise<void> {
  const buf = await buildScscH21InvoiceExcelBuffer(doc);
  downloadXlsxBuffer(buf, h21InvoiceFilename(doc, awb));
}

export function buildScscH21InvoiceHtml(doc: H21InvoiceDocument): string {
  const lineRows = doc.lines
    .map(
      (l: H21InvoiceDocument["lines"][number]) => `<tr>
        <td>${l.no}</td>
        <td>${escapeHtml(l.description)}</td>
        <td>${escapeHtml(l.origin)}</td>
        <td class="num">${l.quantity}</td>
        <td>${escapeHtml(l.uom)}</td>
        <td class="num">${l.weightKg}</td>
        <td class="num">${l.unitPrice}</td>
        <td class="num">${l.amount}</td>
      </tr>`
    )
    .join("");

  const cnee = formatH21InvoiceCneeDisplay(doc.cnee);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(doc.invoiceNo)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
  h1 { font-size: 14pt; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 12px; }
  .label { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
  th { background: #f3f3f3; }
  .num { text-align: right; white-space: nowrap; }
  .note { margin-top: 10px; font-style: italic; }
  .footer { margin-top: 8px; }
  .seal-wrap { margin-top: 24px; text-align: right; }
  .seal-wrap img { max-width: 160px; max-height: 160px; object-fit: contain; }
</style></head><body>
<h1>${escapeHtml(doc.title)}</h1>
<div class="grid">
  <div>
    <div class="label">THE SHIPPER:</div>
    <div>${escapeHtml(doc.shipper.name)}</div>
    <div>${escapeHtml(doc.shipper.address)}</div>
    <div>${escapeHtml(doc.shipper.phone)}</div>
  </div>
  <div>
    <div><span class="label">INVOICE NO.:</span> ${escapeHtml(doc.invoiceNo)}</div>
    <div><span class="label">DATE:</span> ${escapeHtml(doc.dateLabel)}</div>
    <div><span class="label">FLIGHT:</span> ${escapeHtml(doc.flightLabel)}</div>
    <div>${escapeHtml(doc.paymentNote)}</div>
  </div>
</div>
<div class="label">THE CNEE:</div>
<div class="cnee-block">
  <div class="cnee-name">${escapeHtml(cnee.nameLine)}</div>
  ${cnee.addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
  ${cnee.phoneLine ? `<div>${escapeHtml(cnee.phoneLine)}</div>` : ""}
  ${cnee.emailLine ? `<div>${escapeHtml(cnee.emailLine)}</div>` : ""}
</div>
<table>
<thead><tr>
  <th>No</th><th>Description of goods</th><th>Origin</th><th>Qty</th><th>UOM</th><th>Weight KGM</th><th>U.Price USD</th><th>Amount USD</th>
</tr></thead>
<tbody>${lineRows}</tbody>
<tfoot>
<tr><th colspan="5">TOTAL</th><th class="num">${doc.footer.linesKg}</th><th></th><th class="num">${doc.footer.lineAmount}</th></tr>
</tfoot>
</table>
<div class="footer">1. Total carton: ${doc.footer.totalCartonPkgs} PKGS</div>
<div class="footer">2. Total gross weight: ${doc.footer.grossKg} KGM</div>
<div class="note">${escapeHtml(doc.customsNote)}</div>
${
  doc.shipper.sealImageData
    ? `<div class="seal-wrap"><img src="${escapeHtml(doc.shipper.sealImageData)}" alt=""/></div>`
    : ""
}
</body></html>`;
}

export function printScscH21InvoicePdf(doc: H21InvoiceDocument): boolean {
  const html = buildScscH21InvoiceHtml(doc);
  return printHtmlViaHiddenIframe(html, {
    delayMs: 250,
    failAlert: "Không mở được hộp thoại in PDF.",
  });
}
