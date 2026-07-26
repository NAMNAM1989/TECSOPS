import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
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
  let colShipperTax = 8;     // H: Shipper MST
  let colConsigneeName = 9;   // I: Consignee Name
  let colConsigneeAddress = 10; // J: Consignee Address
  let colConsigneeEmail = 11;   // K: Consignee Email
  let colConsigneePhone = 12;   // L: Consignee Phone
  let colConsigneeTax = 14;     // N: Consignee MST
  let colNotifyName = 15;       // O: Notify
  let colNatureOfGoods = 21;    // U: Nature of Goods
  let colPlate = -1;
  let colDriverName = -1;
  let colDriverId = -1;

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
    else if (txt.includes("người gửi") && txt.includes("mst")) colShipperTax = colIdx;
    else if (txt.includes("người nhận") && txt.includes("họ tên")) colConsigneeName = colIdx;
    else if (txt.includes("người nhận") && txt.includes("địa chỉ")) colConsigneeAddress = colIdx;
    else if (txt.includes("người nhận") && txt.includes("email")) colConsigneeEmail = colIdx;
    else if (txt.includes("người nhận") && txt.includes("đt")) colConsigneePhone = colIdx;
    else if (txt.includes("người nhận") && txt.includes("mst")) colConsigneeTax = colIdx;
    else if (txt.includes("thông báo cho") || txt.includes("notify")) colNotifyName = colIdx;
    else if (txt.includes("loại hàng") || txt.includes("nature of goods")) colNatureOfGoods = colIdx;
    else if (txt.includes("biển số") || txt.includes("xe")) colPlate = colIdx;
    else if (txt.includes("tài xế") || txt.includes("lái xe")) colDriverName = colIdx;
    else if (txt.includes("cccd tài xế") || txt.includes("cmnd tài xế")) colDriverId = colIdx;
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
  let totalVehicleCount = 0;
  const customers: CustomerDirectoryEntry[] = [];

  for (const [code, rows] of groupedRows.entries()) {
    const firstRow = rows[0];
    const shipperNameRaw = cellText(firstRow.getCell(colShipperName));
    const shipperAddr = cellText(firstRow.getCell(colShipperAddress));
    const shipperEmail = cellText(firstRow.getCell(colShipperEmail));
    const shipperPhone = cellText(firstRow.getCell(colShipperPhone));
    const shipperTax = colShipperTax > 0 ? cellText(firstRow.getCell(colShipperTax)) : "";

    const name = shipperNameRaw || `Khách hàng ${code}`;

    // Tạo scaffold cho khách hàng
    const entry = scaffoldNewCustomer(newId("cst"));
    entry.code = code;
    entry.name = name;
    entry.customerType = "DIRECT_SHIPPER";
    entry.address = shipperAddr || undefined;
    entry.email = shipperEmail || undefined;
    entry.phone = shipperPhone || undefined;
    entry.taxCode = shipperTax || undefined;

    // Tạo Shipper mặc định
    const defaultShipperItem: CustomerSavedShipper = {
      id: newId("shp"),
      label: "Mặc định",
      shipperName: name,
      shipperAddress: shipperAddr,
      shipperPhone: shipperPhone,
      shipperEmail: shipperEmail,
      taxCode: shipperTax,
    };
    entry.savedShippers = [defaultShipperItem];
    entry.defaultShipperId = defaultShipperItem.id;

    const savedConsignees: CustomerSavedConsignee[] = [];
    const savedGoods: CustomerSavedGoods[] = [];
    const savedVehicles: CustomerSavedVehicle[] = [];

    for (const r of rows) {
      const dest = cellText(r.getCell(colDest)).toUpperCase();
      const cneeName = cellText(r.getCell(colConsigneeName));
      const cneeAddr = cellText(r.getCell(colConsigneeAddress));
      const cneeEmail = cellText(r.getCell(colConsigneeEmail));
      const cneePhone = cellText(r.getCell(colConsigneePhone));
      const notifyName = cellText(r.getCell(colNotifyName));
      const goodsDesc = cellText(r.getCell(colNatureOfGoods));

      const plate = colPlate > 0 ? cellText(r.getCell(colPlate)) : "";
      const driverName = colDriverName > 0 ? cellText(r.getCell(colDriverName)) : "";
      const driverId = colDriverId > 0 ? cellText(r.getCell(colDriverId)) : "";

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

      // Thêm Xe / TX nếu có
      if (plate || driverName) {
        const isDuplicate = savedVehicles.some(
          (v) =>
            (plate && v.licensePlate.toLowerCase() === plate.toLowerCase()) ||
            (driverName && v.driverName.toLowerCase() === driverName.toLowerCase())
        );

        if (!isDuplicate) {
          const vehicleItem: CustomerSavedVehicle = {
            id: newId("veh"),
            licensePlate: plate,
            driverName: driverName,
            driverId: driverId,
          };
          savedVehicles.push(vehicleItem);
          totalVehicleCount++;
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

    entry.savedVehicles = savedVehicles;
    if (savedVehicles.length > 0) {
      entry.defaultVehicleId = savedVehicles[0]!.id;
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

export async function buildCustomerFullProfileTemplateWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HỒ SƠ KH");

  ws.addRow([
    "STT",
    "Mã KH",
    "DEST",
    "Người gửi - Họ tên",
    "Người gửi - Địa chỉ",
    "Người gửi - Email",
    "Người gửi - ĐT",
    "Người gửi - MST",
    "Người nhận - Họ tên",
    "Người nhận - Địa chỉ",
    "Người nhận - Email",
    "Người nhận - ĐT",
    "Người nhận - MST",
    "Notify Party",
    "Loại hàng",
    "Biển số xe",
    "Tên tài xế",
    "CCCD tài xế",
  ]);

  ws.addRow([
    1,
    "CITYLINK",
    "KUL",
    "CÔNG TY TNHH PHÁT TRIỂN CITYLINK",
    "123 Nguyễn Văn Trỗi, Phường 11, Q. Phú Nhuận, TP.HCM",
    "ops@citylink.vn",
    "0901234567",
    "0312345678",
    "GLOBAL LOGISTICS PTE LTD",
    "10 CHANGI SOUTH STREET 2, SINGAPORE",
    "import@globallog.sg",
    "+65 6789 0123",
    "",
    "NOTIFY GLOBAL LOGISTICS",
    "GARMENTS",
    "50H-174.80",
    "NGUYỄN VĂN A",
    "079123456789",
  ]);

  ws.addRow([
    2,
    "ORIENT",
    "CAN",
    "ORIENT CARGO LOGISTICS CO., LTD",
    "456 Lê Văn Sỹ, Phường 14, Q.3, TP.HCM",
    "contact@orientcargo.com",
    "0908765432",
    "0387654321",
    "GUANGZHOU TRADING CO., LTD",
    "BUILDING B, TIANHE DISTRICT, GUANGZHOU, CHINA",
    "cnee@gztrade.cn",
    "+86 20 1234 5678",
    "",
    "",
    "ELECTRONICS",
    "51D-999.88",
    "TRẦN VĂN B",
    "079987654321",
  ]);

  ws.getRow(1).font = { bold: true };
  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 10 },
    { width: 35 },
    { width: 45 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 35 },
    { width: 45 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 28 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
  ];

  const guide = wb.addWorksheet("Hướng dẫn");
  [
    "HƯỚNG DẪN NHẬP DỮ LIỆU MẪU HỒ SƠ KHÁCH HÀNG (4 TAB: NGƯỜI GỬI, CNEE, TÊN HÀNG, XE/TX)",
    "",
    "1. Sheet 'HỒ SƠ KH': Giữ nguyên tiêu đề các cột.",
    "2. Mã KH (Customer Code): Khóa chính nhận diện khách hàng (VD: CITYLINK, ORIENT). Cần 2-5 chữ cái A-Z.",
    "3. Một khách hàng có thể có nhiều dòng trong file tương ứng với nhiều CNEE / DEST / Loại hàng / Xe khác nhau.",
    "4. Các cột Người gửi: Điền thông tin Người gửi (Shipper) mặc định của khách hàng.",
    "5. Các cột Người nhận: Điền thông tin CNEE (Tên, Địa chỉ, SĐT, Email, Notify) nhận hàng tại nước ngoài.",
    "6. Cột Loại hàng (Nature of Goods): Điền mô tả tên hàng hoá khai báo eSID / in phiếu cân.",
    "7. Cột Biển số xe, Tên tài xế, CCCD: Điền phương tiện & tài xế giao nhận.",
    "8. Sau khi nhập file xong, vào màn hình Khách hàng bấm nút 'Import' để tải file lên.",
  ].forEach((line, i) => {
    guide.getRow(i + 1).getCell(1).value = line;
  });
  guide.getColumn(1).width = 100;

  return wb;
}

export async function downloadCustomerFullProfileTemplate(): Promise<void> {
  const { downloadXlsxBuffer } = await import("./downloadXlsx");
  const wb = await buildCustomerFullProfileTemplateWorkbook();
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadXlsxBuffer(buf, "mau-ho-so-khach-hang-day-du-4-tab.xlsx");
}
