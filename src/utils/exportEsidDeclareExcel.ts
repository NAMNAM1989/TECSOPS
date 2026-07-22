import type { Shipment } from "../types/shipment";
import { isTcsWarehouse } from "../constants/warehouses";
import { awbDigitsKey } from "./awbFormat";
import { getActiveEsidRegistrant } from "./esidRegistrantProfile";
import { getActiveEsidAgent } from "./esidAgentProfile";
import { resolveShipmentForEsidDeclare } from "./resolveShipmentForEsidDeclare";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildEsidDeclareCoreFields,
  type EsidDeclareAgentFields,
  type EsidDeclareRegistrantFields,
} from "./esidDeclareFields";
import { awbForFilename, downloadXlsxBuffer } from "./downloadXlsx";

export { flightDateToYmd } from "./esidDeclareFields";

type EsidAgentForExcel = EsidDeclareAgentFields;

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
  registrant?: EsidDeclareRegistrantFields,
  /** Agent ESID cố định — không lấy agent*Print trên lô */
  agent?: EsidAgentForExcel
): EsidDeclareRow {
  const empty = Object.fromEntries(ESID_DECLARE_HEADERS.map((h) => [h, ""])) as EsidDeclareRow;
  const a = agent ?? getActiveEsidAgent();
  const reg: EsidDeclareRegistrantFields = registrant ?? { name: "", tel: "", cccd: "" };
  const core = buildEsidDeclareCoreFields(s, reg, a);
  return {
    ...empty,
    AWB: core.awb,
    FLIGHT_NO: core.flight_no,
    FLIGHT_DATE: core.flight_date,
    DEST: core.dest,
    PCS: core.pcs ?? "",
    GROSS_WEIGHT: core.gross_weight ?? "",
    TOTAL_HAWBS: core.total_hawbs || "",
    NATURE_OF_GOODS: core.nature_of_goods,
    PAYMENT_MODE: core.payment_mode,
    CONSOL: 0,
    TECS_WAREHOUSE: 1,
    SHIPPER_NAME: core.shipper_name,
    SHIPPER_ADDRESS: core.shipper_address,
    SHIPPER_TEL: core.shipper_tel,
    SHIPPER_EMAIL: core.shipper_email,
    SHIPPER_FAX: "",
    AGENT_NAME: core.agent_name,
    AGENT_ADDRESS: core.agent_address,
    AGENT_TEL: core.agent_tel,
    AGENT_EMAIL: core.agent_email,
    AGENT_FAX: core.agent_fax,
    AGENT_VAT: core.agent_vat,
    CONSIGNEE_NAME: core.consignee_name,
    CONSIGNEE_ADDRESS: core.consignee_address,
    CONSIGNEE_TEL: core.consignee_tel,
    CONSIGNEE_EMAIL: core.consignee_email,
    CONSIGNEE_FAX: "",
    CONSIGNEE_VAT: core.consignee_vat,
    NOTIFY_NAME: core.notify_name,
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
    OTHER_REQUEST: core.other_request,
    REGISTRANT_NAME: core.registrant_name,
    REGISTRANT_TEL: core.registrant_tel,
    REGISTRANT_CCCD: core.registrant_cccd,
    SUBMIT: 0,
    SHIPMENT_ID: core.shipment_id,
    NOTE: core.note,
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
    "AGENT_* lấy từ hồ sơ Agent ESID cố định (nút Agent trên Ops), không theo từng lô.",
    "Combobox Shipper/Agent/CNEE trên TCS cần khớp master — Playwright/extension sẽ gõ + chọn.",
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
  const agent = getActiveEsidAgent();
  const rows = list.map((s) => {
    const resolved = resolveShipmentForEsidDeclare(s, directory);
    return shipmentToEsidDeclareRow(resolved.shipment, registrant, agent);
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
    downloadXlsxBuffer(buf, name);
    return { count: list.length, readiness };
  } catch (e) {
    console.error("[downloadEsidDeclareExcel]", e);
    window.alert(e instanceof Error ? e.message : "Không tạo được file Excel.");
    return { count: 0, readiness };
  }
}
