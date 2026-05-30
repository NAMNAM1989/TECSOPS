import type { InvoiceCatalogItem } from "../types/invoiceItem";
import { clampInvoiceCatalogItem } from "./invoiceCatalogCore";

export const CATALOG_UPLOAD_TEMPLATE_PATH = "/templates/invoice/catalog_upload_template.xlsx";

export const CATALOG_EXCEL_COLUMNS = [
  { col: "A", key: "category", header: "LOẠI", hint: "BÁNH, BÚN, CÁ…" },
  { col: "B", key: "description", header: "MÔ TẢ HÀNG", hint: "Bắt buộc — không trùng mô tả cũ" },
  { col: "C", key: "hsCode", header: "HS CODE", hint: "19059090" },
  { col: "D", key: "origin", header: "XUẤT XỨ", hint: "VN" },
  { col: "E", key: "sampleQuantity", header: "QTY MẪU", hint: "1" },
  { col: "F", key: "unit", header: "ĐVT", hint: "PCE / BAG / SET" },
  { col: "G", key: "unitPriceUsd", header: "ĐƠN GIÁ USD", hint: "0.62" },
  { col: "H", key: "_amount", header: "(Amount)", hint: "Bỏ trống — hệ thống tính" },
  { col: "I", key: "kgPerUnit", header: "KG / ĐV", hint: "0.5" },
] as const;

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TEMPLATE_EXAMPLES: InvoiceCatalogItem[] = [
  clampInvoiceCatalogItem({
    id: "example-1",
    category: "BÁNH",
    description:
      "BÁNH AFC. NSX: T03/2026, HSD T03/2027, Xuất xứ VN, Hàng mới 100%",
    hsCode: "19059090",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 0.62,
    kgPerUnit: 0.5,
  }),
  clampInvoiceCatalogItem({
    id: "example-2",
    category: "BÚN",
    description: "BÚN TƯƠI ĐÓNG GÓI 500G, XUẤT XỨ VN, HÀNG MỚI 100%",
    hsCode: "19023099",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 1.2,
    kgPerUnit: 0.5,
  }),
];

type Worksheet = import("exceljs").Worksheet;

function writeCatalogItemRow(ws: Worksheet, row: number, item: InvoiceCatalogItem) {
  ws.getCell(`A${row}`).value = item.category;
  ws.getCell(`B${row}`).value = item.description;
  ws.getCell(`C${row}`).value = item.hsCode;
  ws.getCell(`D${row}`).value = item.origin || "VN";
  ws.getCell(`E${row}`).value = item.sampleQuantity || 1;
  ws.getCell(`F${row}`).value = item.unit || "PCE";
  ws.getCell(`G${row}`).value = item.unitPriceUsd;
  ws.getCell(`H${row}`).value = null;
  ws.getCell(`I${row}`).value = item.kgPerUnit;
}

function styleCatalogSheet(ws: Worksheet) {
  ws.columns = [
    { width: 12 },
    { width: 52 },
    { width: 12 },
    { width: 8 },
    { width: 10 },
    { width: 8 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4338CA" },
  };
  header.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addGuideSheet(wb: import("exceljs").Workbook) {
  const guide = wb.addWorksheet("HUONG_DAN");
  guide.getColumn(1).width = 90;
  const lines = [
    "HƯỚNG DẪN CẬP NHẬT DANH MỤC HÀNG HQ",
    "",
    "1. Sheet DATA: mỗi dòng = 1 mặt hàng (từ dòng 2). Cột B (MÔ TẢ) bắt buộc.",
    "2. Trên web: Khai báo hải quan → Danh mục → «↑ Cập nhật Excel» → chọn file → «Lưu danh mục».",
    "3. Hệ thống chỉ THÊM mặt hàng mới — mô tả trùng với danh mục cũ sẽ bỏ qua.",
    "4. Có thể thêm thủ công bằng «+ Thêm mặt hàng» trên web.",
    "",
    "Cột A=LOẠI | B=MÔ TẢ | C=HS | D=XX | E=QTY | F=ĐVT | G=USD | H=(trống) | I=KG/ĐV",
  ];
  lines.forEach((text, i) => {
    guide.getCell(`A${i + 1}`).value = text;
  });
  guide.getCell("A1").font = { bold: true, size: 12 };
}

export async function buildInvoiceCatalogWorkbook(
  items: readonly InvoiceCatalogItem[],
  opts: { sheetName?: string; includeGuide?: boolean } = {}
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TECSOPS";
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.sheetName ?? "DATA");
  for (const col of CATALOG_EXCEL_COLUMNS) {
    ws.getCell(`${col.col}1`).value = col.header;
  }
  styleCatalogSheet(ws);

  const rows = items.map((it) => clampInvoiceCatalogItem(it));
  rows.forEach((item, idx) => writeCatalogItemRow(ws, idx + 2, item));

  if (opts.includeGuide !== false) {
    addGuideSheet(wb);
  }

  return wb;
}

export async function buildInvoiceCatalogTemplateBuffer(): Promise<ArrayBuffer> {
  const wb = await buildInvoiceCatalogWorkbook(TEMPLATE_EXAMPLES, { includeGuide: true });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function buildInvoiceCatalogExportBuffer(
  items: readonly InvoiceCatalogItem[]
): Promise<ArrayBuffer> {
  const rows = items
    .map((it) => clampInvoiceCatalogItem(it))
    .filter((it) => it.description.trim());
  const wb = await buildInvoiceCatalogWorkbook(rows, { includeGuide: true });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function triggerXlsxDownload(buffer: ArrayBuffer, filename: string) {
  let objectUrl: string | null = null;
  try {
    const blob = new Blob([buffer], { type: MIME_XLSX });
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Tải file mẫu trống + 2 dòng ví dụ. */
export async function downloadInvoiceCatalogTemplate(): Promise<void> {
  try {
    const buffer = await buildInvoiceCatalogTemplateBuffer();
    triggerXlsxDownload(buffer, "mau_danh_muc_hang_hq.xlsx");
  } catch (e) {
    console.error("[downloadInvoiceCatalogTemplate]", e);
    window.alert(e instanceof Error ? e.message : "Không tạo được file mẫu Excel.");
  }
}

/** Xuất danh mục hiện tại (trên màn hình) để sửa offline rồi up lại. */
export async function downloadInvoiceCatalogExport(
  items: readonly InvoiceCatalogItem[]
): Promise<void> {
  try {
    const buffer = await buildInvoiceCatalogExportBuffer(items);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    triggerXlsxDownload(buffer, `danh_muc_hang_hq_${stamp}.xlsx`);
  } catch (e) {
    console.error("[downloadInvoiceCatalogExport]", e);
    window.alert(e instanceof Error ? e.message : "Không xuất được danh mục Excel.");
  }
}

export { TEMPLATE_EXAMPLES };
