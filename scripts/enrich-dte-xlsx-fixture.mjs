/**
 * Bổ sung dòng DTE có CNEE/hàng (mô phỏng file user đã điền đủ).
 */
import ExcelJS from "exceljs";
import path from "node:path";

const SRC = path.resolve("fixtures/ho-so-khach-hang.xlsx");
const OUT = path.resolve("fixtures/ho-so-khach-hang-user-filled.xlsx");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet("HỒ SƠ KH") ?? wb.worksheets[0];

  let dteRow = -1;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const code = String(row.getCell(2).value ?? "").trim().toUpperCase();
    if (code === "DTE" && dteRow < 0) dteRow = n;
  });

  if (dteRow < 0) throw new Error("Không tìm thấy dòng DTE");

  const base = ws.getRow(dteRow);
  base.getCell(3).value = "KUL";
  base.getCell(5).value = "123 Nguyễn Trọng Tố, P.14, Q. Bình Thạnh, TP.HCM";
  base.getCell(6).value = "ducthang@express.vn";
  base.getCell(7).value = "0909123456";
  base.getCell(8).value = "0312345678";
  base.getCell(9).value = "KUALA LUMPUR LOGISTICS SDN BHD";
  base.getCell(10).value = "88 JALAN AMPANG, KUALA LUMPUR";
  base.getCell(11).value = "import@kl-logistics.my";
  base.getCell(12).value = "+60 3 1234 5678";
  base.getCell(14).value = "SAME AS CONSIGNEE";
  base.getCell(15).value = "GARMENTS AND TEXTILES";
  base.getCell(16).value = "51H-123.45";
  base.getCell(17).value = "NGUYỄN VĂN DTE";
  base.getCell(18).value = "079123456789";
  base.commit();

  // Dòng 2 cho DTE — thêm CNEE khác
  const insertAt = dteRow + 1;
  ws.spliceRows(insertAt, 0, [
    dteRow - 1,
    "DTE",
    "SIN",
    "ĐỨC THẮNG EXPRESS",
    "123 Nguyễn Trọng Tố, P.14, Q. Bình Thạnh, TP.HCM",
    "ducthang@express.vn",
    "0909123456",
    "0312345678",
    "SINGAPORE TRADING PTE LTD",
    "10 ANSON ROAD, SINGAPORE",
    "sg@trade.sg",
    "+65 6123 4567",
    "",
    "",
    "ELECTRONIC PARTS",
    "50F-888.99",
    "TRẦN VĂN B",
    "079987654321",
  ]);

  await wb.xlsx.writeFile(OUT);
  console.log("Wrote", OUT, "DTE row", dteRow, "+ inserted row", insertAt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
