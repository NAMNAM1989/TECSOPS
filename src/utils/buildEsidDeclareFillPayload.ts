import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";
import { flightDateToYmd } from "./exportEsidDeclareExcel";
import type { EsidRegistrantProfile } from "./esidRegistrantProfile";
import type { EsidAgentProfile } from "./esidAgentProfile";
import { ESID_DEFAULT_PAYMENT_MODE, esidTotalHawbs } from "./esidDeclareDefaults";

/** Payload gửi agent POST /esid/declare-fill */
export type EsidDeclareFillPayload = {
  warehouse: "TECS-TCS";
  submit: false;
  confirm_submit: false;
  /** Bắt buộc chọn chuyến qua nút CHỌN CHUYẾN BAY */
  choose_flight: true;
  registrant: {
    name: string;
    tel: string;
    cccd: string;
  };
  shipment: {
    shipment_id: string;
    awb: string;
    flight_no: string;
    flight_date: string;
    dest: string;
    pcs: number | null;
    gross_weight: number | null;
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
    nature_of_goods: string;
    other_request: string;
    payment_mode: string;
    total_hawbs: number;
    tecs_warehouse: true;
    consol: false;
  };
};

export function buildEsidDeclareFillPayload(
  s: Shipment,
  registrant: Pick<EsidRegistrantProfile, "name" | "tel" | "cccd">,
  agent: Pick<EsidAgentProfile, "name" | "address" | "tel" | "email" | "vat" | "fax">
): EsidDeclareFillPayload | null {
  const awb = awbDigitsKey(s.awb);
  if (awb.length !== 11) return null;
  return {
    warehouse: "TECS-TCS",
    submit: false,
    confirm_submit: false,
    choose_flight: true,
    registrant: {
      name: (registrant.name || "").trim(),
      tel: (registrant.tel || "").trim(),
      cccd: (registrant.cccd || "").replace(/\s+/g, "").trim(),
    },
    shipment: {
      shipment_id: s.id,
      awb,
      flight_no: (s.flight || "").trim(),
      flight_date: flightDateToYmd(s.flightDate || "", s.sessionDate || ""),
      dest: (s.dest || "").trim().toUpperCase(),
      pcs: s.pcs == null || Number.isNaN(Number(s.pcs)) ? 0 : Number(s.pcs),
      gross_weight: s.kg,
      shipper_name: (s.shipperNamePrint || s.customer || "").trim(),
      shipper_address: (s.shipperAddressPrint || "").trim(),
      shipper_tel: (s.shipperPhonePrint || "").trim(),
      shipper_email: (s.shipperEmailPrint || "").trim(),
      // Agent cố định (ưu tiên hồ sơ máy — không dùng agent*Print trên lô)
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
      nature_of_goods: (s.goodsDescriptionPrint || "").trim(),
      other_request: (s.otherRequirementsPrint || "").trim(),
      payment_mode: ESID_DEFAULT_PAYMENT_MODE,
      total_hawbs: esidTotalHawbs(s),
      tecs_warehouse: true,
      consol: false,
    },
  };
}
