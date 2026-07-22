import type { Shipment } from "../types/shipment";
import { awbDigitsKey } from "./awbFormat";
import {
  buildEsidDeclareCoreFields,
  type EsidDeclareAgentFields,
  type EsidDeclareRegistrantFields,
} from "./esidDeclareFields";

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
  registrant: EsidDeclareRegistrantFields,
  agent: EsidDeclareAgentFields
): EsidDeclareFillPayload | null {
  const awb = awbDigitsKey(s.awb);
  if (awb.length !== 11) return null;
  const core = buildEsidDeclareCoreFields(s, registrant, agent);
  return {
    warehouse: "TECS-TCS",
    submit: false,
    confirm_submit: false,
    choose_flight: true,
    registrant: {
      name: core.registrant_name,
      tel: core.registrant_tel,
      cccd: core.registrant_cccd,
    },
    shipment: {
      shipment_id: core.shipment_id,
      awb,
      flight_no: core.flight_no,
      flight_date: core.flight_date,
      dest: core.dest,
      pcs: core.pcs == null ? 0 : core.pcs,
      gross_weight: core.gross_weight,
      shipper_name: core.shipper_name,
      shipper_address: core.shipper_address,
      shipper_tel: core.shipper_tel,
      shipper_email: core.shipper_email,
      agent_name: core.agent_name,
      agent_address: core.agent_address,
      agent_tel: core.agent_tel,
      agent_email: core.agent_email,
      agent_vat: core.agent_vat,
      agent_fax: core.agent_fax,
      consignee_name: core.consignee_name,
      consignee_address: core.consignee_address,
      consignee_tel: core.consignee_tel,
      consignee_email: core.consignee_email,
      consignee_vat: core.consignee_vat,
      notify_name: core.notify_name,
      nature_of_goods: core.nature_of_goods,
      other_request: core.other_request,
      payment_mode: core.payment_mode,
      total_hawbs: core.total_hawbs,
      tecs_warehouse: true,
      consol: false,
    },
  };
}
