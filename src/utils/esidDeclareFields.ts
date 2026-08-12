/**
 * Nguồn sự thật map lô Ops → field khai báo ESID (Excel dry-run + Điền form).
 * Tránh lệch payment_mode / HAWB / party giữa hai đường xuất.
 */
import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";
import { parseFlightDateDisplayToYmd } from "./bookingDateParse";
import { formatKgTotal } from "./formatKgTotal";

/** Khớp agent — TECS-TCS mặc định Chuyển khoản. */
export const ESID_DEFAULT_PAYMENT_MODE = "Chuyển khoản/Bank transfer";

/** Kho TCS — Điền chọn Tiền mặt/Cash. */
export const ESID_CASH_PAYMENT_MODE = "Tiền mặt/Cash";

/** Giới hạn ô Other Request trên form TCS khi ghép Volume Weight + Note + yêu cầu KH. */
export const ESID_OTHER_REQUEST_MAX = 500;

export type EsidDeclareAgentFields = {
  name: string;
  address: string;
  tel: string;
  email: string;
  vat: string;
  fax: string;
};

export type EsidDeclareRegistrantFields = {
  name: string;
  tel: string;
  cccd: string;
};

/** Field nghiệp vụ dùng chung Excel + declare-fill. */
export type EsidDeclareCoreFields = {
  shipment_id: string;
  awb: string;
  flight_no: string;
  flight_date: string;
  dest: string;
  pcs: number | null;
  gross_weight: number | null;
  total_hawbs: number;
  nature_of_goods: string;
  payment_mode: string;
  consol: false;
  tecs_warehouse: boolean;
  /** Kho TCS: tick checkbox Khác/Other */
  shc_other: boolean;
  /** Kho TCS: tick #agreeConfirm lúc Điền (không HOÀN TẤT) */
  agree_on_fill: boolean;
  shipper_name: string;
  shipper_address: string;
  shipper_tel: string;
  shipper_email: string;
  agent_name: string;
  agent_address: string;
  agent_tel: string;
  agent_email: string;
  agent_vat: string;
  agent_fax: string;
  consignee_name: string;
  consignee_address: string;
  consignee_tel: string;
  consignee_email: string;
  consignee_vat: string;
  notify_name: string;
  other_request: string;
  note: string;
  registrant_name: string;
  registrant_tel: string;
  registrant_cccd: string;
};

/** "05APR" + session YYYY-MM-DD → YYYY-MM-DD */
export function flightDateToYmd(flightDate: string, sessionDate: string): string {
  const year = Number((sessionDate || "").slice(0, 4));
  if (!year || !flightDate.trim()) return "";
  return parseFlightDateDisplayToYmd(flightDate, year);
}

/** HAWB phụ: có chuỗi HAWB → 1, không → 0 (khớp form TCS). */
export function esidTotalHawbs(s: Pick<Shipment, "hawb">): number {
  return s.hawb?.trim() ? 1 : 0;
}

/**
 * Other Request khi Điền ESID:
 * Volume Weight (DIM) + Note lô + Yêu cầu riêng KH (`otherRequirementsPrint`).
 */
export function composeEsidOtherRequest(
  s: Pick<Shipment, "dimWeightKg" | "note" | "otherRequirementsPrint">,
): string {
  const parts: string[] = [];
  const dim = s.dimWeightKg;
  if (dim != null && Number.isFinite(Number(dim))) {
    parts.push(`Volume Weight: ${formatKgTotal(Number(dim))}`);
  }
  const note = (s.note || "").trim();
  if (note) parts.push(note);
  const req = (s.otherRequirementsPrint || "").trim();
  if (req) parts.push(req);
  const joined = parts.join(" | ");
  return joined.length > ESID_OTHER_REQUEST_MAX
    ? joined.slice(0, ESID_OTHER_REQUEST_MAX)
    : joined;
}

export function buildEsidDeclareCoreFields(
  s: Shipment,
  registrant: EsidDeclareRegistrantFields,
  agent: EsidDeclareAgentFields
): EsidDeclareCoreFields {
  const awb = awbDigitsKey(s.awb);
  const kgRaw = s.kg;
  const grossWeight =
    kgRaw == null || Number.isNaN(Number(kgRaw)) ? null : Number(kgRaw);
  const isTcsWh = s.warehouse === "TCS";
  return {
    shipment_id: s.id,
    awb: awb.length === 11 ? awb : (s.awb || "").trim(),
    flight_no: (s.flight || "").trim(),
    flight_date: flightDateToYmd(s.flightDate || "", s.sessionDate || ""),
    dest: (s.dest || "").trim().toUpperCase(),
    pcs: s.pcs == null || Number.isNaN(Number(s.pcs)) ? null : Number(s.pcs),
    gross_weight: grossWeight,
    total_hawbs: esidTotalHawbs(s),
    nature_of_goods: (s.goodsDescriptionPrint || "").trim(),
    payment_mode: isTcsWh ? ESID_CASH_PAYMENT_MODE : ESID_DEFAULT_PAYMENT_MODE,
    consol: false,
    /** Checkbox TECS trên form — chỉ bật cho kho TECS-TCS. */
    tecs_warehouse: s.warehouse === "TECS-TCS",
    shc_other: isTcsWh,
    agree_on_fill: isTcsWh,
    shipper_name: (s.shipperNamePrint || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "",
    shipper_address: (s.shipperAddressPrint || "").trim(),
    shipper_tel: (s.shipperPhonePrint || "").trim(),
    shipper_email: (s.shipperEmailPrint || "").trim(),
    agent_name: (agent.name || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "",
    agent_address: (agent.address || "").trim(),
    agent_tel: (agent.tel || "").trim(),
    agent_email: (agent.email || "").trim(),
    agent_vat: (agent.vat || "").trim(),
    agent_fax: (agent.fax || "").trim(),
    consignee_name: (s.consigneeNamePrint || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "",
    consignee_address: (s.consigneeAddressPrint || "").trim(),
    consignee_tel: (s.consigneePhonePrint || "").trim(),
    consignee_email: (s.consigneeEmailPrint || "").trim(),
    consignee_vat: (s.taxCodePrint || "").trim(),
    notify_name: (s.notifyNamePrint || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "",
    other_request: composeEsidOtherRequest(s),
    note: (s.note || "").trim(),
    registrant_name: (registrant.name || "").trim(),
    registrant_tel: (registrant.tel || "").trim(),
    registrant_cccd: (registrant.cccd || "").replace(/\s+/g, "").trim(),
  };
}
