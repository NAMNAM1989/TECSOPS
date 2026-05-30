#!/usr/bin/env node
/** Tạo file mẫu upload danh mục HQ: public/templates/invoice/catalog_upload_template.xlsx */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/templates/invoice/catalog_upload_template.xlsx");

const HEADERS = [
  ["A", "LOẠI"],
  ["B", "MÔ TẢ HÀNG"],
  ["C", "HS CODE"],
  ["D", "XUẤT XỨ"],
  ["E", "QTY MẪU"],
  ["F", "ĐVT"],
  ["G", "ĐƠN GIÁ USD"],
  ["H", "(Amount)"],
  ["I", "KG / ĐV"],
];

const EXAMPLES = [
  [
    "BÁNH",
    "BÁNH AFC. NSX: T03/2026, HSD T03/2027, Xuất xứ VN, Hàng mới 100%",
    "19059090",
    "VN",
    1,
    "BAG",
    0.62,
    null,
    0.5,
  ],
  [
    "BÚN",
    "BÚN TƯƠI ĐÓNG GÓI 500G, XUẤT XỨ VN, HÀNG MỚI 100%",
    "19023099",
    "VN",
    1,
    "BAG",
    1.2,
    null,
    0.5,
  ],
];

const wb = new ExcelJS.Workbook();
wb.creator = "TECSOPS";
const ws = wb.addWorksheet("DATA");
for (const [col, label] of HEADERS) {
  ws.getCell(`${col}1`).value = label;
}
ws.columns = [12, 52, 12, 8, 10, 8, 12, 10, 10].map((w) => ({ width: w }));
const header = ws.getRow(1);
header.font = { bold: true, color: { argb: "FFFFFFFF" } };
header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
ws.views = [{ state: "frozen", ySplit: 1 }];

EXAMPLES.forEach((row, i) => {
  const r = i + 2;
  ws.getCell(`A${r}`).value = row[0];
  ws.getCell(`B${r}`).value = row[1];
  ws.getCell(`C${r}`).value = row[2];
  ws.getCell(`D${r}`).value = row[3];
  ws.getCell(`E${r}`).value = row[4];
  ws.getCell(`F${r}`).value = row[5];
  ws.getCell(`G${r}`).value = row[6];
  ws.getCell(`H${r}`).value = row[7];
  ws.getCell(`I${r}`).value = row[8];
});

const guide = wb.addWorksheet("HUONG_DAN");
guide.getColumn(1).width = 90;
const lines = [
  "HƯỚNG DẪN CẬP NHẬT DANH MỤC HÀNG HQ",
  "",
  "Sheet DATA: mỗi dòng = 1 mặt hàng (từ dòng 2). Cột B bắt buộc.",
  "Web: Khai báo hải quan → Danh mục → «↑ Cập nhật Excel» → «Lưu danh mục».",
  "Chỉ thêm mặt hàng mới — mô tả trùng danh mục cũ sẽ bỏ qua.",
  "",
  "A=LOẠI | B=MÔ TẢ | C=HS | D=XX | E=QTY | F=ĐVT | G=USD | H=trống | I=KG/ĐV",
];
lines.forEach((t, i) => {
  guide.getCell(`A${i + 1}`).value = t;
});
guide.getCell("A1").font = { bold: true, size: 12 };

mkdirSync(dirname(OUT), { recursive: true });
const buf = await wb.xlsx.writeBuffer();
writeFileSync(OUT, Buffer.from(buf));
console.log(`OK: ${OUT}`);
