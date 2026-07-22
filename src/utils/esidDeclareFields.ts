/**
 * Nguồn sự thật map lô Ops → field khai báo ESID (Excel dry-run + Điền form).
 * Tránh lệch payment_mode / HAWB / party giữa hai đường xuất.
 */
import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";
import { parseFlightDateDisplayToYmd } from "./bookingDateParse";

/** Khớp agent TCS / memory esid-declare-optimize — không dùng Tiền mặt. */
export const ESID_DEFAULT_PAYMENT_MODE = "Chuyển khoản/Bank transfer";

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
  tecs_warehouse: true;
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

export function buildEsidDeclareCoreFields(
  s: Shipment,
  registrant: EsidDeclareRegistrantFields,
  agent: EsidDeclareAgentFields
): EsidDeclareCoreFields {
  const awb = awbDigitsKey(s.awb);
  return {
    shipment_id: s.id,
    awb: awb.length === 11 ? awb : (s.awb || "").trim(),
    flight_no: (s.flight || "").trim(),
    flight_date: flightDateToYmd(s.flightDate || "", s.sessionDate || ""),
    dest: (s.dest || "").trim().toUpperCase(),
    pcs: s.pcs == null || Number.isNaN(Number(s.pcs)) ? null : Number(s.pcs),
    gross_weight: s.kg,
    total_hawbs: esidTotalHawbs(s),
    nature_of_goods: (s.goodsDescriptionPrint || "").trim(),
    payment_mode: ESID_DEFAULT_PAYMENT_MODE,
    consol: false,
    tecs_warehouse: true,
    shipper_name: (s.shipperNamePrint || s.customer || "").trim(),
    shipper_address: (s.shipperAddressPrint || "").trim(),
    shipper_tel: (s.shipperPhonePrint || "").trim(),
    shipper_email: (s.shipperEmailPrint || "").trim(),
    agent_name: (agent.name || "").trim(),
    agent_address: (agent.address || "").trim(),
    agent_tel: (agent.tel || "").trim(),
    agent_email: (agent.email || "").trim(),
    agent_vat: (agent.vat || "").trim(),
    agent_fax: (agent.fax || "").trim(),
    consignee_name: (s.consigneeNamePrint || "").trim(),
    consignee_address: (s.consigneeAddressPrint || "").trim(),
    consignee_tel: (s.consigneePhonePrint || "").trim(),
    consignee_email: (s.consigneeEmailPrint || "").trim(),
    consignee_vat: (s.taxCodePrint || "").trim(),
    notify_name: (s.notifyNamePrint || "").trim(),
    other_request: (s.otherRequirementsPrint || "").trim(),
    note: (s.note || "").trim(),
    registrant_name: (registrant.name || "").trim(),
    registrant_tel: (registrant.tel || "").trim(),
    registrant_cccd: (registrant.cccd || "").replace(/\s+/g, "").trim(),
  };
}
