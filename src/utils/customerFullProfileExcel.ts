import type {
  CustomerDirectoryEntry,
  CustomerDriverIdType,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
  CustomerVehicleType,
} from "../types/customerDirectory";
import {
  inferLetterKeyFromCustomerCode,
  isValidCustomerSyncCode,
  normalizeCustomerSyncCode,
} from "./customerCodeOps";
import { normalizeAgentCode } from "./customerProfileInputFormat";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";
import { downloadXlsxBuffer } from "./downloadXlsx";

/** Một mẫu cố định — Tải mẫu / Import / Export dùng chung. */
export const CUSTOMER_FULL_PROFILE_HEADERS = [
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
  "Số giấy tờ TX",
  "Nhãn xe",
  "Loại xe",
  "Loại GT TX",
] as const;

const FULL_PROFILE_COLUMN_WIDTHS = [
  6, 14, 10, 35, 45, 24, 16, 16, 35, 45, 24, 16, 16, 28, 20, 16, 20, 18, 16, 12, 12,
];

const FULL_PROFILE_GUIDE_LINES = [
  "HƯỚNG DẪN — MẪU HỒ SƠ KHÁCH HÀNG (duy nhất)",
  "",
  "1. Sheet 'HỒ SƠ KH': giữ nguyên tiêu đề cột. Mẫu / Import / Export dùng cùng format này.",
  "2. Mã KH: khóa đồng bộ (2–5 chữ A–Z, VD: CITYLINK). Mã đã có → hợp nhất; chưa có → tạo mới.",
  "3. Một khách có thể nhiều dòng (nhiều CNEE / DEST / loại hàng / xe).",
  "4. Người gửi: Họ tên, Địa chỉ, Email, ĐT, MST — đồng bộ tab Người gửi & điền OPS.",
  "5. Người nhận + Notify Party — đồng bộ tab CNEE & notify_name khi điền eSID.",
  "6. Loại hàng — tab Tên hàng / Nature of Goods.",
  "7. Xe/TX: Biển số, Tên TX, Số giấy tờ, Nhãn xe, Loại xe (OTO/XEMAY/BAGAC/DIBO), Loại GT (CCCD/PP/GPLX).",
  "8. Tải mẫu → điền → Import. Export xuất đúng cùng cột để chỉnh rồi Import lại. File cũ 18 cột vẫn đọc được.",
];

function parseExcelVehicleType(raw: string): CustomerVehicleType | undefined {
  const u = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!u) return undefined;
  if (u === "OTO" || u.includes("O TO")) return "OTO";
  if (u === "XEMAY" || u.includes("XE MAY") || u.includes("MOTOR")) return "XEMAY";
  if (u === "BAGAC" || u.includes("BA GAC")) return "BAGAC";
  if (u === "DIBO" || u.includes("DI BO") || u.includes("WALK")) return "DIBO";
  return undefined;
}

function parseExcelDriverIdType(raw: string): CustomerDriverIdType | undefined {
  const u = raw.trim().toUpperCase();
  if (!u) return undefined;
  if (u === "PP" || u.includes("PASSPORT") || u.includes("HỘ CHIẾU") || u.includes("HO CHIEU"))
    return "PP";
  if (u === "GPLX" || u.includes("BẰNG LÁI") || u.includes("BANG LAI") || u.includes("LICENSE"))
    return "GPLX";
  if (u === "CCCD" || u.includes("CMND") || u.includes("CĂN CƯỚC")) return "CCCD";
  return undefined;
}

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

function findDataStartRow(
  ws: import("exceljs").Worksheet,
  colCode: number,
): number {
  const maxScan = Math.min(6, ws.rowCount || 6);
  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber++) {
    const raw = cellText(ws.getRow(rowNumber).getCell(colCode));
    const lower = raw.toLowerCase();
    if (!raw) continue;
    if (
      lower.includes("mã kh") ||
      lower.includes("ma kh") ||
      lower.includes("customer code") ||
      lower === "stt"
    ) {
      continue;
    }
    const code = normalizeAgentCode(raw);
    if (code.length >= 2) return rowNumber;
  }
  return 2;
}

export type FullProfileImportResult = {
  customers: CustomerDirectoryEntry[];
  customerCount: number;
  consigneeCount: number;
  goodsCount: number;
  vehicleCount: number;
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
      : (buffer as Parameters<typeof wb.xlsx.load>[0]);
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
  let colConsigneeTax = 13; // M: Người nhận - MST
  let colNotifyName = 14; // N: Notify Party
  let colNatureOfGoods = 15; // O: Loại hàng
  let colPlate = 16; // P: Biển số xe
  let colDriverName = 17; // Q: Tên tài xế
  let colDriverId = 18; // R: Số giấy tờ TX (cũ: CCCD tài xế)
  let colVehicleLabel = 19; // S: Nhãn xe (optional — file cũ không có)
  let colVehicleType = 20; // T: Loại xe
  let colDriverIdType = 21; // U: Loại GT TX

  // Thử dò lại vị trí cột từ header nếu có
  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);
  row1.eachCell({ includeEmpty: true }, (cell, colIdx) => {
    const txt = (cellText(cell.value) + " " + cellText(row2.getCell(colIdx).value)).toLowerCase();
    if (txt.includes("mã kh") || txt.includes("mã khách") || txt.includes("customer code"))
      colCode = colIdx;
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
    else if (txt.includes("nhãn xe") || txt.includes("nhan xe")) colVehicleLabel = colIdx;
    else if (txt.includes("loại xe") || txt.includes("loai xe")) colVehicleType = colIdx;
    else if (
      txt.includes("loại gt") ||
      txt.includes("loai gt") ||
      txt.includes("loại giấy tờ") ||
      txt.includes("loai giay to")
    )
      colDriverIdType = colIdx;
    else if (txt.includes("biển số")) colPlate = colIdx;
    else if (
      (txt.includes("tài xế") || txt.includes("lái xe")) &&
      !txt.includes("cccd") &&
      !txt.includes("cmnd") &&
      !txt.includes("giấy tờ") &&
      !txt.includes("giay to")
    )
      colDriverName = colIdx;
    else if (
      txt.includes("cccd") ||
      txt.includes("cmnd") ||
      txt.includes("số giấy tờ") ||
      txt.includes("so giay to") ||
      txt.includes("giấy tờ tx") ||
      txt.includes("giay to tx")
    )
      colDriverId = colIdx;
  });
  void colConsigneeTax;

  const dataStartRow = findDataStartRow(ws, colCode);

  // Gom các dòng theo Mã Khách Hàng
  const groupedRows = new Map<string, import("exceljs").Row[]>();

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < dataStartRow) return;

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
      const cneeTax =
        colConsigneeTax > 0 ? cellText(r.getCell(colConsigneeTax)) : "";
      void cneeTax;
      const notifyName = cellText(r.getCell(colNotifyName));
      const goodsDesc = cellText(r.getCell(colNatureOfGoods));

      const plate = cellText(r.getCell(colPlate));
      const driverName = cellText(r.getCell(colDriverName));
      const driverId = cellText(r.getCell(colDriverId));
      const vehicleLabel =
        colVehicleLabel > 0 ? cellText(r.getCell(colVehicleLabel)) : "";
      const vehicleType = parseExcelVehicleType(
        colVehicleType > 0 ? cellText(r.getCell(colVehicleType)) : "",
      );
      const driverIdType = parseExcelDriverIdType(
        colDriverIdType > 0 ? cellText(r.getCell(colDriverIdType)) : "",
      );

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
            ...(vehicleLabel ? { label: vehicleLabel } : {}),
            licensePlate: plate,
            driverName: driverName,
            driverId: driverId,
            ...(driverIdType ? { driverIdType } : { driverIdType: "CCCD" }),
            ...(vehicleType ? { vehicleType } : { vehicleType: "OTO" }),
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
    vehicleCount: totalVehicleCount,
  };
}

async function createFullProfileWorkbookShell(): Promise<{
  wb: import("exceljs").Workbook;
  ws: import("exceljs").Worksheet;
}> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HỒ SƠ KH");
  ws.addRow([...CUSTOMER_FULL_PROFILE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.columns = FULL_PROFILE_COLUMN_WIDTHS.map((width) => ({ width }));

  const guide = wb.addWorksheet("Hướng dẫn");
  FULL_PROFILE_GUIDE_LINES.forEach((line, i) => {
    guide.getRow(i + 1).getCell(1).value = line;
  });
  guide.getColumn(1).width = 100;

  return { wb, ws };
}

function destFromConsigneeLabel(label: string): string {
  const m = label.trim().match(/^([A-Z]{3})\s*[-–—]/i);
  return m?.[1]?.toUpperCase() ?? "";
}

function defaultShipperOf(
  entry: CustomerDirectoryEntry,
): CustomerSavedShipper | undefined {
  const list = entry.savedShippers ?? [];
  if (!list.length) return undefined;
  return list.find((s) => s.id === entry.defaultShipperId) ?? list[0];
}

/** Xuất danh bạ đúng mẫu Hồ sơ KH (cùng cột Tải mẫu / Import). */
export async function buildCustomerFullProfileExportWorkbook(
  customers: readonly CustomerDirectoryEntry[],
) {
  const { wb, ws } = await createFullProfileWorkbookShell();
  let stt = 1;

  for (const entry of customers) {
    const code = normalizeAgentCode(entry.code);
    if (!code) continue;

    const shipper = defaultShipperOf(entry);
    const shipperName = shipper?.shipperName?.trim() || entry.name.trim();
    const shipperAddress =
      shipper?.shipperAddress?.trim() || (entry.address ?? "").trim();
    const shipperEmail =
      shipper?.shipperEmail?.trim() || (entry.email ?? "").trim();
    const shipperPhone =
      shipper?.shipperPhone?.trim() || (entry.phone ?? "").trim();
    const shipperTax =
      shipper?.taxCode?.trim() || (entry.taxCode ?? "").trim();

    const cnees = entry.savedConsignees ?? [];
    const goods = entry.savedGoods ?? [];
    const vehicles = entry.savedVehicles ?? [];
    const rowCount = Math.max(cnees.length, goods.length, vehicles.length, 1);

    for (let i = 0; i < rowCount; i++) {
      const cnee = cnees[i];
      const g = goods[i];
      const v = vehicles[i];
      ws.addRow([
        stt++,
        code,
        cnee ? destFromConsigneeLabel(cnee.label) : "",
        shipperName,
        shipperAddress,
        shipperEmail,
        shipperPhone,
        shipperTax,
        cnee?.consigneeName ?? "",
        cnee?.consigneeAddress ?? "",
        cnee?.consigneeEmail ?? "",
        cnee?.consigneePhone ?? "",
        "",
        cnee?.notifyName ?? "",
        g?.goodsDescription ?? "",
        v?.licensePlate ?? "",
        v?.driverName ?? "",
        v?.driverId ?? "",
        v?.label ?? "",
        v?.vehicleType ?? "",
        v?.driverIdType ?? "",
      ]);
    }
  }

  return wb;
}

export async function buildCustomerFullProfileTemplateWorkbook() {
  const { wb, ws } = await createFullProfileWorkbookShell();

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
    "Xe cố định",
    "OTO",
    "CCCD",
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
    "Thuê ngoài",
    "OTO",
    "CCCD",
  ]);

  return wb;
}

export async function downloadCustomerFullProfileTemplate(): Promise<void> {
  const wb = await buildCustomerFullProfileTemplateWorkbook();
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadXlsxBuffer(buf, "mau-ho-so-khach-hang.xlsx");
}

export async function downloadCustomerFullProfileExport(
  customers: readonly CustomerDirectoryEntry[],
): Promise<void> {
  const wb = await buildCustomerFullProfileExportWorkbook(customers);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  downloadXlsxBuffer(
    buf,
    `ho-so-khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function findExistingByImportCode(
  customers: CustomerDirectoryEntry[],
  byCode: Map<string, CustomerDirectoryEntry>,
  importCode: string,
): CustomerDirectoryEntry | null {
  const exact = byCode.get(importCode.toLowerCase());
  if (exact) return exact;

  if (!isValidCustomerSyncCode(importCode)) return null;
  const key = normalizeCustomerSyncCode(importCode);
  return (
    customers.find((c) => {
      const code = normalizeAgentCode(c.code);
      if (code === key) return true;
      const letterKey = inferLetterKeyFromCustomerCode(code);
      return letterKey === key && (code === key || code.startsWith(key));
    }) ?? null
  );
}

/** Hợp nhất import mẫu Hồ sơ KH vào danh bạ hiện có. */
export function applyFullProfileImport(
  existing: readonly CustomerDirectoryEntry[],
  imported: readonly CustomerDirectoryEntry[],
): {
  customers: CustomerDirectoryEntry[];
  created: number;
  updated: number;
  consigneesAdded: number;
  goodsAdded: number;
} {
  const customers = existing.map((e) => ({ ...e }));
  const byCode = new Map(
    customers.map((e) => [normalizeAgentCode(e.code).toLowerCase(), e]),
  );
  let created = 0;
  let updated = 0;
  let consigneesAdded = 0;
  let goodsAdded = 0;

  const assignIfNonEmpty = (
    hit: CustomerDirectoryEntry,
    imp: CustomerDirectoryEntry,
  ) => {
    if (imp.name?.trim()) hit.name = imp.name.trim();
    if (imp.address?.trim()) hit.address = imp.address.trim();
    if (imp.email?.trim()) hit.email = imp.email.trim();
    if (imp.phone?.trim()) hit.phone = imp.phone.trim();
    if (imp.taxCode?.trim()) hit.taxCode = imp.taxCode.trim();
  };

  const mergeShipper = (
    target: CustomerSavedShipper,
    source: CustomerSavedShipper,
  ): CustomerSavedShipper => ({
    ...target,
    shipperName: source.shipperName?.trim() || target.shipperName,
    shipperAddress: source.shipperAddress?.trim() || target.shipperAddress,
    shipperEmail: source.shipperEmail?.trim() || target.shipperEmail,
    shipperPhone: source.shipperPhone?.trim() || target.shipperPhone,
    taxCode: source.taxCode?.trim() || target.taxCode,
  });

  for (const imp of imported) {
    const code = normalizeAgentCode(imp.code);
    if (!code) continue;

    const hit = findExistingByImportCode(customers, byCode, code);
    if (hit) {
      assignIfNonEmpty(hit, imp);

      const existingShippers = [...(hit.savedShippers ?? [])];
      const impShippers = imp.savedShippers ?? [];
      if (impShippers.length > 0) {
        const defIdx = hit.defaultShipperId
          ? existingShippers.findIndex((s) => s.id === hit.defaultShipperId)
          : 0;
        if (defIdx >= 0 && existingShippers[defIdx]) {
          existingShippers[defIdx] = mergeShipper(
            existingShippers[defIdx]!,
            impShippers[0]!,
          );
        } else if (existingShippers.length === 0) {
          existingShippers.push(impShippers[0]!);
        } else {
          existingShippers[0] = mergeShipper(existingShippers[0]!, impShippers[0]!);
        }
        for (const shp of impShippers) {
          const isDup = existingShippers.some(
            (x) =>
              x.shipperName.toLowerCase() === shp.shipperName.toLowerCase() &&
              x.shipperAddress.toLowerCase() === shp.shipperAddress.toLowerCase(),
          );
          if (!isDup) existingShippers.push(shp);
        }
      }
      hit.savedShippers = existingShippers;
      if (!hit.defaultShipperId && existingShippers.length > 0) {
        hit.defaultShipperId = existingShippers[0]!.id;
      }

      const existingCnees = [...(hit.savedConsignees ?? [])];
      for (const cnee of imp.savedConsignees ?? []) {
        const idx = existingCnees.findIndex(
          (x) =>
            x.consigneeName.toLowerCase() === cnee.consigneeName.toLowerCase() &&
            x.consigneeAddress.toLowerCase() ===
              cnee.consigneeAddress.toLowerCase(),
        );
        if (idx >= 0) {
          const prev = existingCnees[idx]!;
          existingCnees[idx] = {
            ...prev,
            consigneeName: cnee.consigneeName || prev.consigneeName,
            consigneeAddress: cnee.consigneeAddress || prev.consigneeAddress,
            consigneePhone: cnee.consigneePhone || prev.consigneePhone,
            consigneeEmail: cnee.consigneeEmail || prev.consigneeEmail,
            notifyName: cnee.notifyName || prev.notifyName,
            label: cnee.label || prev.label,
          };
        } else {
          existingCnees.push(cnee);
          consigneesAdded++;
        }
      }
      hit.savedConsignees = existingCnees;
      if (!hit.defaultConsigneeId && existingCnees.length > 0) {
        hit.defaultConsigneeId = existingCnees[0]!.id;
      }

      const existingGoods = [...(hit.savedGoods ?? [])];
      for (const g of imp.savedGoods ?? []) {
        const idx = existingGoods.findIndex(
          (x) =>
            x.goodsDescription.toLowerCase() ===
            g.goodsDescription.toLowerCase(),
        );
        if (idx >= 0) {
          existingGoods[idx] = {
            ...existingGoods[idx]!,
            goodsDescription:
              g.goodsDescription || existingGoods[idx]!.goodsDescription,
            label: g.label || existingGoods[idx]!.label,
          };
        } else {
          existingGoods.push(g);
          goodsAdded++;
        }
      }
      hit.savedGoods = existingGoods;
      if (!hit.defaultGoodsId && existingGoods.length > 0) {
        hit.defaultGoodsId = existingGoods[0]!.id;
      }

      const existingVehicles = [...(hit.savedVehicles ?? [])];
      for (const v of imp.savedVehicles ?? []) {
        const idx = existingVehicles.findIndex(
          (x) =>
            (v.licensePlate &&
              x.licensePlate.toLowerCase() === v.licensePlate.toLowerCase()) ||
            (v.driverName &&
              x.driverName.toLowerCase() === v.driverName.toLowerCase()),
        );
        if (idx >= 0) {
          const prev = existingVehicles[idx]!;
          existingVehicles[idx] = {
            ...prev,
            licensePlate: v.licensePlate || prev.licensePlate,
            driverName: v.driverName || prev.driverName,
            driverId: v.driverId || prev.driverId,
            label: v.label || prev.label,
            vehicleType: v.vehicleType || prev.vehicleType,
            driverIdType: v.driverIdType || prev.driverIdType,
          };
        } else {
          existingVehicles.push(v);
        }
      }
      hit.savedVehicles = existingVehicles;
      if (!hit.defaultVehicleId && existingVehicles.length > 0) {
        hit.defaultVehicleId = existingVehicles[0]!.id;
      }

      updated++;
    } else {
      customers.push(imp);
      byCode.set(code.toLowerCase(), imp);
      created++;
      consigneesAdded += imp.savedConsignees?.length ?? 0;
      goodsAdded += imp.savedGoods?.length ?? 0;
    }
  }

  return { customers, created, updated, consigneesAdded, goodsAdded };
}
