import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { parseFlightDateDisplayToYmd } from "./bookingDateParse";
import { awbDigitsKey } from "./awbFormat";
import { getActiveEsidRegistrant } from "./esidRegistrantProfile";
import { resolveShipmentForEsidDeclare } from "./resolveShipmentForEsidDeclare";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";

/** Cột sheet ESID_DECLARE — khớp Python esid_declare_excel.py */
export const ESID_DECLARE_HEADERS = [
  "AWB",
  "FLIGHT_NO",
  "FLIGHT_DATE",
  "DEST",
  "PCS",
  "GROSS_WEIGHT",
  "TOTAL_HAWBS",
  "NATURE_OF_GOODS",
  "PAYMENT_MODE",
  "CONSOL",
  "TECS_WAREHOUSE",
  "SHIPPER_NAME",
  "SHIPPER_ADDRESS",
  "SHIPPER_TEL",
  "SHIPPER_EMAIL",
  "SHIPPER_FAX",
  "AGENT_NAME",
  "AGENT_ADDRESS",
  "AGENT_TEL",
  "AGENT_EMAIL",
  "AGENT_FAX",
  "AGENT_VAT",
  "CONSIGNEE_NAME",
  "CONSIGNEE_ADDRESS",
  "CONSIGNEE_TEL",
  "CONSIGNEE_EMAIL",
  "CONSIGNEE_FAX",
  "CONSIGNEE_VAT",
  "NOTIFY_NAME",
  "NOTIFY_ADDRESS",
  "NOTIFY_TEL",
  "NOTIFY_EMAIL",
  "NOTIFY_FAX",
  "NOTIFY_REMARK",
  "SHC_PER",
  "SHC_PHARMA",
  "SHC_VAL",
  "SHC_AVI",
  "SHC_DGR",
  "SHC_BUP",
  "OTHER_REQUEST",
  "REGISTRANT_NAME",
  "REGISTRANT_TEL",
  "REGISTRANT_CCCD",
  "SUBMIT",
  "SHIPMENT_ID",
  "NOTE",
] as const;

export type EsidDeclareColumn = (typeof ESID_DECLARE_HEADERS)[number];

export type EsidDeclareRow = Record<EsidDeclareColumn, string | number>;

export type EsidDeclareReadiness = {
  awb: string;
  canDryFill: boolean;
  missingForFill: EsidDeclareColumn[];
  missingForSubmit: EsidDeclareColumn[];
  warnings: string[];
};

const REQUIRED_FOR_FILL: EsidDeclareColumn[] = [
  "AWB",
  "FLIGHT_NO",
  "DEST",
  "PCS",
  "SHIPPER_NAME",
  "SHIPPER_ADDRESS",
  "CONSIGNEE_NAME",
  "CONSIGNEE_ADDRESS",
];

const MANUAL_BEFORE_SUBMIT: EsidDeclareColumn[] = [
  "REGISTRANT_NAME",
  "REGISTRANT_TEL",
  "REGISTRANT_CCCD",
];

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function awbForFilename(awb: string): string {
  return awb.replace(/[^\dA-Za-z-]+/g, "_").slice(0, 40) || "AWB";
}

/** "05APR" + session YYYY-MM-DD → YYYY-MM-DD */
export function flightDateToYmd(flightDate: string, sessionDate: string): string {
  const year = Number((sessionDate || "").slice(0, 4));
  if (!year || !flightDate.trim()) return "";
  return parseFlightDateDisplayToYmd(flightDate, year);
}

/** YYYY-MM-DD → DD-MM-YYYY (Ant picker TCS). */
export function ymdToDmy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd.trim();
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function canExportEsidDeclare(s: Shipment): boolean {
  return isTcsWarehouse(s.warehouse) && Boolean(awbDigitsKey(s.awb));
}

export function shipmentToEsidDeclareRow(
  s: Shipment,
  registrant?: Pick<{ name: string; tel: string; cccd: string }, "name" | "tel" | "cccd">
): EsidDeclareRow {
  const digits = awbDigitsKey(s.awb) || "";
  const ymd = flightDateToYmd(s.flightDate || "", s.sessionDate || "");
  const empty = Object.fromEntries(ESID_DECLARE_HEADERS.map((h) => [h, ""])) as EsidDeclareRow;
  return {
    ...empty,
    AWB: digits.length === 11 ? digits : (s.awb || "").trim(),
    FLIGHT_NO: (s.flight || "").trim(),
    FLIGHT_DATE: ymd,
    DEST: (s.dest || "").trim().toUpperCase(),
    PCS: s.pcs ?? "",
    GROSS_WEIGHT: s.kg ?? "",
    TOTAL_HAWBS: s.hawb?.trim() ? 1 : "",
    NATURE_OF_GOODS: (s.goodsDescriptionPrint || "").trim(),
    PAYMENT_MODE: "Tiền mặt/Cash",
    CONSOL: 0,
    TECS_WAREHOUSE: 1,
    SHIPPER_NAME: (s.shipperNamePrint || s.customer || "").trim(),
    SHIPPER_ADDRESS: (s.shipperAddressPrint || "").trim(),
    SHIPPER_TEL: (s.shipperPhonePrint || "").trim(),
    SHIPPER_EMAIL: (s.shipperEmailPrint || "").trim(),
    SHIPPER_FAX: "",
    AGENT_NAME: (s.agentNamePrint || "").trim(),
    AGENT_ADDRESS: (s.agentAddressPrint || "").trim(),
    AGENT_TEL: (s.agentPhonePrint || "").trim(),
    AGENT_EMAIL: (s.agentEmailPrint || "").trim(),
    AGENT_FAX: "",
    AGENT_VAT: (s.agentTaxCodePrint || "").trim(),
    CONSIGNEE_NAME: (s.consigneeNamePrint || "").trim(),
    CONSIGNEE_ADDRESS: (s.consigneeAddressPrint || "").trim(),
    CONSIGNEE_TEL: (s.consigneePhonePrint || "").trim(),
    CONSIGNEE_EMAIL: (s.consigneeEmailPrint || "").trim(),
    CONSIGNEE_FAX: "",
    CONSIGNEE_VAT: (s.taxCodePrint || "").trim(),
    NOTIFY_NAME: (s.notifyNamePrint || "").trim(),
    NOTIFY_ADDRESS: "",
    NOTIFY_TEL: "",
    NOTIFY_EMAIL: "",
    NOTIFY_FAX: "",
    NOTIFY_REMARK: "",
    SHC_PER: 0,
    SHC_PHARMA: 0,
    SHC_VAL: 0,
    SHC_AVI: 0,
    SHC_DGR: 0,
    SHC_BUP: 0,
    OTHER_REQUEST: (s.otherRequirementsPrint || "").trim(),
    REGISTRANT_NAME: (registrant?.name || "").trim(),
    REGISTRANT_TEL: (registrant?.tel || "").trim(),
    REGISTRANT_CCCD: (registrant?.cccd || "").replace(/\s+/g, "").trim(),
    SUBMIT: 0,
    SHIPMENT_ID: s.id,
    NOTE: (s.note || "").trim(),
  };
}

export function analyzeEsidDeclareRow(row: EsidDeclareRow): EsidDeclareReadiness {
  const missingForFill = REQUIRED_FOR_FILL.filter((c) => String(row[c] ?? "").trim() === "");
  const missingForSubmit = MANUAL_BEFORE_SUBMIT.filter((c) => String(row[c] ?? "").trim() === "");
  const warnings: string[] = [];
  if (row.GROSS_WEIGHT !== "" && row.GROSS_WEIGHT != null) {
    warnings.push("GROSS_WEIGHT có trong Excel nhưng form TCS hiện không có ô GW");
  }
  if (!row.SHIPPER_NAME && row.SHIPPER_ADDRESS) {
    warnings.push("Có địa chỉ shipper nhưng thiếu tên — combobox TCS có thể không chọn được master");
  }
  if (String(row.SUBMIT) === "1" && missingForSubmit.length) {
    warnings.push("SUBMIT=1 cần đủ REGISTRANT_NAME / TEL / CCCD");
  }
  return {
    awb: String(row.AWB || ""),
    canDryFill: missingForFill.length === 0,
    missingForFill,
    missingForSubmit,
    warnings,
  };
}

export function analyzeShipmentForEsidDeclare(s: Shipment): EsidDeclareReadiness {
  return analyzeEsidDeclareRow(shipmentToEsidDeclareRow(s));
}

async function buildWorkbook(rows: EsidDeclareRow[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();

  const guide = wb.addWorksheet("HUONG_DAN");
  guide.getColumn(1).width = 100;
  const guideLines = [
    "Khai báo ESID nhanh — TECSOPS → Excel → TCS",
    "",
    "TCS portal KHÔNG có nút Upload Excel trên form KHAI BÁO ESID.",
    "File này = dữ liệu đã nhập trên Ops để rà soát / agent điền form nhanh hơn.",
    "",
    "Cột cam đậm = bắt buộc dry-fill. REGISTRANT_* = nhập tay trước khi SUBMIT=1.",
    "SUBMIT mặc định 0 (không bấm HOÀN TẤT).",
    "Combobox Shipper/Agent/CNEE trên TCS cần khớp master — agent sẽ gõ + chọn.",
  ];
  guideLines.forEach((line, i) => {
    guide.getCell(i + 1, 1).value = line;
  });

  const ws = wb.addWorksheet("ESID_DECLARE");
  ws.addRow([...ESID_DECLARE_HEADERS]);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  ESID_DECLARE_HEADERS.forEach((h, i) => {
    const cell = header.getCell(i + 1);
    if (REQUIRED_FOR_FILL.includes(h)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC65911" } };
    } else if (MANUAL_BEFORE_SUBMIT.includes(h)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
      cell.font = { bold: true };
    }
    ws.getColumn(i + 1).width = Math.max(12, Math.min(22, h.length + 2));
  });
  for (const row of rows) {
    ws.addRow(ESID_DECLARE_HEADERS.map((h) => row[h]));
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ESID_DECLARE_HEADERS.length },
  };

  const analysis = wb.addWorksheet("PHAN_TICH");
  analysis.addRow(["AWB", "CAN_DRY_FILL", "MISSING_FILL", "MISSING_SUBMIT", "WARNINGS"]);
  analysis.getRow(1).font = { bold: true };
  for (const row of rows) {
    const a = analyzeEsidDeclareRow(row);
    analysis.addRow([
      a.awb,
      a.canDryFill ? "YES" : "NO",
      a.missingForFill.join(", "),
      a.missingForSubmit.join(", "),
      a.warnings.join(" | "),
    ]);
  }
  analysis.getColumn(1).width = 14;
  analysis.getColumn(2).width = 14;
  analysis.getColumn(3).width = 40;
  analysis.getColumn(4).width = 36;
  analysis.getColumn(5).width = 50;

  return wb;
}

function triggerDownload(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], { type: MIME_XLSX });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Xuất 1 hoặc nhiều lô TCS → Excel khai báo ESID. */
export async function downloadEsidDeclareExcel(
  shipments: Shipment | Shipment[],
  directory: readonly CustomerDirectoryEntry[] = []
): Promise<{
  count: number;
  readiness: EsidDeclareReadiness[];
}> {
  const list = (Array.isArray(shipments) ? shipments : [shipments]).filter(canExportEsidDeclare);
  if (list.length === 0) {
    window.alert("Chỉ áp dụng kho TECS-TCS và lô đã có AWB.");
    return { count: 0, readiness: [] };
  }
  const registrant = getActiveEsidRegistrant();
  const rows = list.map((s) => {
    const resolved = resolveShipmentForEsidDeclare(s, directory);
    return shipmentToEsidDeclareRow(resolved.shipment, registrant);
  });
  const readiness = rows.map(analyzeEsidDeclareRow);
  try {
    const wb = await buildWorkbook(rows);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const name =
      list.length === 1
        ? `ESID_DECLARE_${awbForFilename(list[0].awb)}_${stamp}.xlsx`
        : `ESID_DECLARE_${list.length}AWB_${stamp}.xlsx`;
    triggerDownload(buf, name);
    return { count: list.length, readiness };
  } catch (e) {
    console.error("[downloadEsidDeclareExcel]", e);
    window.alert(e instanceof Error ? e.message : "Không tạo được file Excel.");
    return { count: 0, readiness };
  }
}
