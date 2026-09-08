/**
 * Phiếu cân SCSC — đổ dữ liệu lô vào template Excel đã canh máy in kim.
 * Chỉ ghi cell.value; không đụng pageSetup / font / merge / agent cố định.
 */
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { isScscWarehouse } from "../constants/warehouses";
import { notifyError, notifyWarning } from "../ui/notify";
import { formatAwb, awbDigitsKey } from "./awbFormat";
import {
  findCustomerEntry,
  resolveSavedConsigneeForBooking,
  resolveSavedGoodsForBooking,
  resolveSavedShipperForBooking,
} from "./customerBookingResolve";
import { awbForFilename, downloadXlsxBuffer } from "./downloadXlsx";
import { resolvePrintAddressForShipment } from "./printAddressMultiline";
import { clipScscGoodsDescriptionPrint } from "./scscPrintContent";

/** Template SoT — agent Vantage đã gắn sẵn trong file. */
export const PHIEU_CAN_TEMPLATE_URL = "/templates/phieucan/phieucan-scsc.xlsx?v=20260908";

export const PHIEU_CAN_SHEET_NAME = "PHIEUCAN";

/** Ô web điền — không gồm agent (C6/C8/C10/C11). */
export const PHIEU_CAN_VALUE_CELLS = [
  "O1", // MAWB
  "C1", // shipper name
  "C2", // shipper address
  "C4", // address / C/O phụ
  "I4", // shipper email
  "C5", // MST shipper
  "C12", // CNEE name
  "C14", // CNEE address
  "C16", // CNEE phone
  "A18", // notify
  "Q18", // dest
  "D20", // HAWB
  "O20", // flight/date
  "D23", // goods
] as const;

/** Agent cố định trên template — code không được ghi đè. */
export const PHIEU_CAN_FIXED_AGENT_CELLS = ["C6", "C8", "C10", "C11"] as const;

export type PhieuCanPrintModel = {
  mawb: string;
  shipperName: string;
  /** Dòng địa chỉ chính (ô C2). */
  shipperAddress: string;
  /** Dòng phụ / C/O (ô C4) — dòng 2+ của địa chỉ nếu có. */
  shipperAddressExtra: string;
  shipperEmail: string;
  taxCode: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  notifyName: string;
  dest: string;
  hawb: string;
  flightDate: string;
  goodsDescription: string;
};

function compact(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function splitShipperAddress(address: string): { main: string; extra: string } {
  const lines = address
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { main: "", extra: "" };
  if (lines.length === 1) return { main: lines[0]!, extra: "" };
  return { main: lines[0]!, extra: lines.slice(1).join(" ") };
}

function formatConsigneeTel(phone: string): string {
  const p = phone.trim();
  if (!p) return "";
  if (/^tel\s*:/i.test(p)) return compact(p, 40);
  return compact(`TEL: ${p}`, 40);
}

export function canDownloadPhieuCanExcel(s: Pick<Shipment, "warehouse" | "awb">): boolean {
  return isScscWarehouse(s.warehouse) && awbDigitsKey(s.awb).length === 11;
}

/** Map lô + danh bạ → giá trị in phiếu cân (không gồm agent). */
export function buildPhieuCanPrintModel(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): PhieuCanPrintModel {
  const customer = findCustomerEntry(shipment, directory);
  const shipper = resolveSavedShipperForBooking(shipment, customer);
  const consignee = resolveSavedConsigneeForBooking(shipment, customer);
  const goods = resolveSavedGoodsForBooking(shipment, customer);

  const addressRaw = resolvePrintAddressForShipment({
    bookingPrint: shipment.shipperAddressPrint,
    directoryPrint: shipper?.shipperAddress ?? "",
    maxLines: 6,
  });
  const { main: shipperAddress, extra: shipperAddressExtra } = splitShipperAddress(addressRaw);

  const cneeAddress = resolvePrintAddressForShipment({
    bookingPrint: shipment.consigneeAddressPrint,
    directoryPrint: consignee?.consigneeAddress ?? "",
    maxLines: 6,
  });

  const flight = (shipment.flight ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const flightDate = (shipment.flightDate ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const flightCombo =
    flight && flightDate ? `${flight}/${flightDate}` : flight || flightDate;

  const hawbRaw = (shipment.hawb ?? "").trim();
  const goodsRaw =
    shipment.goodsDescriptionPrint?.trim() || goods?.goodsDescription?.trim() || "";

  return {
    mawb: formatAwb(shipment.awb),
    shipperName: compact(
      shipment.shipperNamePrint?.trim() || shipper?.shipperName?.trim() || "",
      120
    ),
    shipperAddress: compact(shipperAddress, 200),
    shipperAddressExtra: compact(shipperAddressExtra, 120),
    shipperEmail: compact(
      shipment.shipperEmailPrint?.trim() || shipper?.shipperEmail?.trim() || "",
      50
    ),
    taxCode: compact(shipment.taxCodePrint?.trim() || shipper?.taxCode?.trim() || "", 24),
    consigneeName: compact(
      shipment.consigneeNamePrint?.trim() || consignee?.consigneeName?.trim() || "",
      80
    ),
    consigneeAddress: compact(cneeAddress.replace(/\n/g, " "), 200),
    consigneePhone: formatConsigneeTel(
      shipment.consigneePhonePrint?.trim() || consignee?.consigneePhone?.trim() || ""
    ),
    notifyName: compact(
      shipment.notifyNamePrint?.trim() || consignee?.notifyName?.trim() || "",
      80
    ),
    dest: compact((shipment.dest ?? "").trim().toUpperCase(), 8),
    hawb: hawbRaw ? compact(hawbRaw, 40) : "NO HAWB",
    flightDate: compact(flightCombo, 24),
    goodsDescription: clipScscGoodsDescriptionPrint(goodsRaw),
  };
}

/** Ghi model vào worksheet — chỉ `.value`, không đụng agent / page setup. */
export function applyPhieuCanPrintModel(
  sheet: { getCell: (addr: string) => { value: unknown } },
  model: PhieuCanPrintModel
): void {
  const map: Record<(typeof PHIEU_CAN_VALUE_CELLS)[number], string> = {
    O1: model.mawb,
    C1: model.shipperName,
    C2: model.shipperAddress,
    C4: model.shipperAddressExtra,
    I4: model.shipperEmail,
    C5: model.taxCode,
    C12: model.consigneeName,
    C14: model.consigneeAddress,
    C16: model.consigneePhone,
    A18: model.notifyName,
    Q18: model.dest,
    D20: model.hawb,
    O20: model.flightDate,
    D23: model.goodsDescription,
  };
  for (const addr of PHIEU_CAN_VALUE_CELLS) {
    sheet.getCell(addr).value = map[addr] || null;
  }
}

let cachedTemplate: ArrayBuffer | null = null;

async function loadPhieuCanTemplate(): Promise<ArrayBuffer> {
  if (cachedTemplate) return cachedTemplate.slice(0);
  const res = await fetch(PHIEU_CAN_TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(`Không tải được mẫu phiếu cân (${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  cachedTemplate = buf;
  return buf.slice(0);
}

/** Test / HMR — bỏ cache template. */
export function clearPhieuCanTemplateCache(): void {
  cachedTemplate = null;
}

async function buildPhieuCanWorkbook(model: PhieuCanPrintModel) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await loadPhieuCanTemplate());
  const sheet = wb.getWorksheet(PHIEU_CAN_SHEET_NAME);
  if (!sheet) {
    throw new Error(`Không tìm thấy sheet ${PHIEU_CAN_SHEET_NAME} trong mẫu.`);
  }
  applyPhieuCanPrintModel(sheet, model);
  return wb;
}

/**
 * Tải Excel phiếu cân đã đổ dữ liệu lô.
 * In bằng Excel trên máy kim — không in từ trình duyệt.
 */
export function downloadPhieuCanExcel(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = []
): void {
  if (!isScscWarehouse(shipment.warehouse)) {
    notifyWarning("Phiếu cân Excel chỉ dùng cho kho SCSC (TECS-SCSC / SCSC).", "Phiếu cân");
    return;
  }
  if (awbDigitsKey(shipment.awb).length !== 11) {
    notifyWarning("Cần AWB đủ 11 số trước khi tải phiếu cân.", "Phiếu cân");
    return;
  }

  const model = buildPhieuCanPrintModel(shipment, directory);
  void (async () => {
    try {
      const wb = await buildPhieuCanWorkbook(model);
      const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      downloadXlsxBuffer(buf, `PHIEUCAN_${awbForFilename(model.mawb)}.xlsx`);
    } catch (e) {
      console.error("[downloadPhieuCanExcel]", e);
      notifyError(
        e instanceof Error ? e.message : "Không tạo được file Excel phiếu cân.",
        "Phiếu cân"
      );
    }
  })();
}
