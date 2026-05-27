import ExcelJS from "exceljs";

const GOODS_FIRST = 16;

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object" && "result" in v && v.result != null) return String(v.result);
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v);
}

function parseFooterNumber(text) {
  const m = /(\d+(?:\.\d+)?)/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * Đọc payload từ workbook đã điền mẫu INV.xlsx (sheet NNL).
 * @param {Buffer} xlsxBuffer
 */
export async function invoicePayloadFromXlsxBuffer(xlsxBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuffer);
  const ws = wb.getWorksheet("NNL");
  if (!ws) throw new Error('Sheet "NNL" không có trong file Excel.');

  const invoiceNo = cellText(ws.getCell("G3").value).trim();
  const dateStr = cellText(ws.getCell("G4").value).trim();
  const flight = cellText(ws.getCell("G5").value).trim();

  const cneeLines = [];
  for (let r = 9; r <= 12; r++) {
    const t = cellText(ws.getCell(r, 1).value).trim();
    if (t) cneeLines.push(t);
  }

  let totalRow = 26;
  for (let r = GOODS_FIRST; r <= 80; r++) {
    if (cellText(ws.getCell(r, 1).value).trim().toUpperCase() === "TOTAL") {
      totalRow = r;
      break;
    }
  }

  const items = [];
  for (let r = GOODS_FIRST; r < totalRow; r++) {
    const no = ws.getCell(r, 1).value;
    const desc = cellText(ws.getCell(r, 2).value).trim();
    if (no == null && !desc) continue;
    if (String(no ?? "").trim().toUpperCase() === "TOTAL") break;
    items.push({
      description: desc,
      hsCode: cellText(ws.getCell(r, 4).value).trim(),
      origin: cellText(ws.getCell(r, 5).value).trim() || "VN",
      quantity: Number(ws.getCell(r, 6).value) || 0,
      unit: cellText(ws.getCell(r, 7).value).trim() || "PCE",
      unitPriceUsd: Number(ws.getCell(r, 8).value) || 0,
      kgPerUnit: Number(ws.getCell(r, 10).value) || 0,
    });
  }

  const cartonText = cellText(ws.getCell(totalRow + 1, 3).value);
  const kgText = cellText(ws.getCell(totalRow + 2, 3).value);

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
