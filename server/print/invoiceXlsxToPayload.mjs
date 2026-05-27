import ExcelJS from "exceljs";

/** Dòng hàng đầu sau header bảng (layout buildInvoiceWorkbook). */
const GOODS_FIRST_ROW = 15;

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object" && "result" in v && v.result != null) return String(v.result);
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "formula" in v && v.result != null) return String(v.result);
  return String(v);
}

function parseFooterNumber(text) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * Đọc payload từ workbook invoice Noncommercial (sheet NNL, 8 cột A–H).
 * Khớp `buildInvoiceWorkbook` trong shipmentInvoiceFill.ts.
 * @param {Buffer} xlsxBuffer
 */
export async function invoicePayloadFromXlsxBuffer(xlsxBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuffer);
  const ws = wb.getWorksheet("NNL");
  if (!ws) throw new Error('Sheet "NNL" không có trong file Excel.');

  const invoiceNo = cellText(ws.getCell(3, 6).value).trim();
  const dateStr = cellText(ws.getCell(4, 6).value).trim();
  const flight = cellText(ws.getCell(5, 6).value).trim();

  const cneeLines = [];
  for (let r = 9; r <= 12; r++) {
    const t = cellText(ws.getCell(r, 2).value).trim();
    if (t) cneeLines.push(t);
  }

  let totalRow = GOODS_FIRST_ROW;
  for (let r = GOODS_FIRST_ROW; r <= 120; r++) {
    if (cellText(ws.getCell(r, 2).value).trim().toUpperCase() === "TOTAL") {
      totalRow = r;
      break;
    }
  }

  const items = [];
  for (let r = GOODS_FIRST_ROW; r < totalRow; r++) {
    const no = ws.getCell(r, 1).value;
    const desc = cellText(ws.getCell(r, 2).value).trim();
    if (no == null && !desc) continue;
    if (String(no ?? "").trim().toUpperCase() === "TOTAL") break;
    items.push({
      description: desc,
      hsCode: cellText(ws.getCell(r, 3).value).trim(),
      origin: cellText(ws.getCell(r, 4).value).trim() || "VN",
      quantity: Number(ws.getCell(r, 5).value) || 0,
      unit: cellText(ws.getCell(r, 6).value).trim() || "PCE",
      unitPriceUsd: Number(ws.getCell(r, 7).value) || 0,
      kgPerUnit: 0,
    });
  }

  const cartonText = cellText(ws.getCell(totalRow + 1, 2).value);
  const kgText = cellText(ws.getCell(totalRow + 2, 2).value);

  return {
    invoiceNo,
    dateStr,
    flight,
    cneeLines,
    items,
    pcs: parseFooterNumber(cartonText),
    kg: parseFooterNumber(kgText),
    awb: "",
  };
}
