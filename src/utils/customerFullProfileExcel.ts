import type { CustomerDirectoryEntry, CustomerSavedConsignee, CustomerSavedGoods, CustomerSavedShipper } from "../types/customerDirectory";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("").trim();
    if (o.result != null) return String(o.result).trim();
  }
  return "";
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type FullProfileImportResult = {
  customers: CustomerDirectoryEntry[];
  customerCount: number;
  consigneeCount: number;
  goodsCount: number;
};

/**
 * Đọc file Excel Hồ Sơ Khách Hàng 22 cột (HỒ SƠ KH)
 * Tự động gom nhóm theo MÃ KHÁCH HÀNG và trích xuất CNEE, Shipper, Loại hàng.
 */
export async function parseCustomerFullProfileWorkbook(buffer: ArrayBuffer | Buffer): Promise<FullProfileImportResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const inputBuffer =
    typeof Buffer !== "undefined" && buffer instanceof ArrayBuffer
      ? Buffer.from(buffer)
      : (buffer as any);
  await wb.xlsx.load(inputBuffer);

  const ws =
    wb.worksheets.find((s) => s.name.toUpperCase().includes("HỒ SƠ") || s.name.toUpperCase().includes("HO SO")) ??
    wb.worksheets[0];

  if (!ws) {
    throw new Error("File Excel không có sheet dữ liệu.");
  }

  // Mặc định cột theo mẫu Hồ sơ KH 22 cột
  let colCode = 2;       // B: Mã KH
  let colDest = 3;       // C: DEST
  let colShipperName = 4; // D: Shipper Name
  let colShipperAddress = 5; // E: Shipper Address
  let colShipperEmail = 6;   // F: Shipper Email
  let colShipperPhone = 7;   // G: Shipper Phone
  let colConsigneeName = 9;   // I: Consignee Name
  let colConsigneeAddress = 10; // J: Consignee Address
  let colConsigneeEmail = 11;   // K: Consignee Email
  let colConsigneePhone = 12;   // L: Consignee Phone
  let colConsigneeTax = 14;     // N: Consignee MST
  let colNotifyName = 15;       // O: Notify
  let colNatureOfGoods = 21;    // U: Nature of Goods

  // Thử dò lại vị trí cột từ header nếu có
  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);
  row1.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    const txt = (cellText(cell.value) + " " + cellText(row2.getCell(colIdx).value)).toLowerCase();
    if (txt.includes("mã khách") || txt.includes("customer code")) colCode = colIdx;
    else if (txt.includes("dest")) colDest = colIdx;
    else if (txt.includes("người gửi") && txt.includes("họ tên")) colShipperName = colIdx;
    else if (txt.includes("người gửi") && txt.includes("địa chỉ")) colShipperAddress = colIdx;
    else if (txt.includes("người gửi") && txt.includes("email")) colShipperEmail = colIdx;
    else if (txt.includes("người gửi") && txt.includes("đt")) colShipperPhone = colIdx;
    else if (txt.includes("người nhận") && txt.includes("họ tên")) colConsigneeName = colIdx;
    else if (txt.includes("người nhận") && txt.includes("địa chỉ")) colConsigneeAddress = colIdx;
    else if (txt.includes("người nhận") && txt.includes("email")) colConsigneeEmail = colIdx;
    else if (txt.includes("người nhận") && txt.includes("đt")) colConsigneePhone = colIdx;
    else if (txt.includes("người nhận") && txt.includes("mst")) colConsigneeTax = colIdx;
    else if (txt.includes("thông báo cho") || txt.includes("notify")) colNotifyName = colIdx;
    else if (txt.includes("loại hàng") || txt.includes("nature of goods")) colNatureOfGoods = colIdx;
  });
  void colConsigneeTax;

  // Gom các dòng theo Mã Khách Hàng
  const groupedRows = new Map<string, any[]>();

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 2) return; // Bỏ qua 2 hàng header

    const codeRaw = cellText(row.getCell(colCode));
    const code = normalizeAgentCode(codeRaw);
    if (!code) return;

    if (!groupedRows.has(code)) {
      groupedRows.set(code, []);
    }
    groupedRows.get(code)!.push(row);
  });

  let totalConsigneeCount = 0;
  let totalGoodsCount = 0;
  const customers: CustomerDirectoryEntry[] = [];

  for (const [code, rows] of groupedRows.entries()) {
    const firstRow = rows[0];
    const shipperNameRaw = cellText(firstRow.getCell(colShipperName));
    const shipperAddr = cellText(firstRow.getCell(colShipperAddress));
    const shipperEmail = cellText(firstRow.getCell(colShipperEmail));
    const shipperPhone = cellText(firstRow.getCell(colShipperPhone));

    const name = shipperNameRaw || `Khách hàng ${code}`;

    // Tạo scaffold cho khách hàng
    const entry = scaffoldNewCustomer(newId("cst"));
    entry.code = code;
    entry.name = name;
    entry.customerType = "DIRECT_SHIPPER";
    entry.address = shipperAddr || undefined;
    entry.email = shipperEmail || undefined;
    entry.phone = shipperPhone || undefined;

    // Tạo Shipper mặc định
    const defaultShipperItem: CustomerSavedShipper = {
      id: newId("shp"),
      label: "Mặc định",
      shipperName: name,
      shipperAddress: shipperAddr,
      shipperPhone: shipperPhone,
      shipperEmail: shipperEmail,
      taxCode: "",
    };
    entry.savedShippers = [defaultShipperItem];
    entry.defaultShipperId = defaultShipperItem.id;

    const savedConsignees: CustomerSavedConsignee[] = [];
    const savedGoods: CustomerSavedGoods[] = [];

    for (const r of rows) {
      const dest = cellText(r.getCell(colDest)).toUpperCase();
      const cneeName = cellText(r.getCell(colConsigneeName));
      const cneeAddr = cellText(r.getCell(colConsigneeAddress));
      const cneeEmail = cellText(r.getCell(colConsigneeEmail));
      const cneePhone = cellText(r.getCell(colConsigneePhone));
      const notifyName = cellText(r.getCell(colNotifyName));
      const goodsDesc = cellText(r.getCell(colNatureOfGoods));

      // Thêm Consignee nếu có
      if (cneeName) {
        const isDuplicate = savedConsignees.some(
          (c) => c.consigneeName.toLowerCase() === cneeName.toLowerCase() && c.consigneeAddress.toLowerCase() === cneeAddr.toLowerCase()
        );

        if (!isDuplicate) {
          const labelPrefix = dest ? `${dest} - ` : "";
          const shortName = cneeName.length > 22 ? cneeName.slice(0, 22) + "…" : cneeName;
          const cneeItem: CustomerSavedConsignee = {
            id: newId("cne"),
            label: `${labelPrefix}${shortName}`,
            consigneeName: cneeName,
            consigneeAddress: cneeAddr,
            consigneePhone: cneePhone,
            consigneeEmail: cneeEmail,
            notifyName: notifyName,
          };
          savedConsignees.push(cneeItem);
          totalConsigneeCount++;
        }
      }

      // Thêm Goods nếu có
      if (goodsDesc) {
        const isDuplicate = savedGoods.some(
          (g) => g.goodsDescription.toLowerCase() === goodsDesc.toLowerCase()
        );

        if (!isDuplicate) {
          const shortLabel = goodsDesc.length > 25 ? goodsDesc.slice(0, 25) + "…" : goodsDesc;
          const goodsItem: CustomerSavedGoods = {
            id: newId("gds"),
            label: shortLabel,
            goodsDescription: goodsDesc,
          };
          savedGoods.push(goodsItem);
          totalGoodsCount++;
        }
      }
    }

    entry.savedConsignees = savedConsignees;
    if (savedConsignees.length > 0) {
      entry.defaultConsigneeId = savedConsignees[0]!.id;
    }

    entry.savedGoods = savedGoods;
    if (savedGoods.length > 0) {
      entry.defaultGoodsId = savedGoods[0]!.id;
    }

    customers.push(entry);
  }

  return {
    customers,
    customerCount: customers.length,
    consigneeCount: totalConsigneeCount,
    goodsCount: totalGoodsCount,
  };
}
