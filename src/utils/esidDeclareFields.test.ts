import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  ESID_DEFAULT_PAYMENT_MODE,
  buildEsidDeclareCoreFields,
  esidTotalHawbs,
} from "./esidDeclareFields";
import { shipmentToEsidDeclareRow } from "./exportEsidDeclareExcel";
import { buildEsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";

function base(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-07-20",
    awb: "73807183061",
    flight: "VN0773",
    flightDate: "21JUL",
    cutoff: "",
    cutoffNote: "",
    note: "n",
    dest: "icn",
    warehouse: "TECS-TCS",
    pcs: 2,
    kg: 45.5,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "KHACH A",
    customerCode: "KA",
    shipperNamePrint: "CONG TY A",
    shipperAddressPrint: "123 Q7",
    consigneeNamePrint: "BUYER B",
    consigneeAddressPrint: "SEOUL",
    goodsDescriptionPrint: "GARMENT",
    ...over,
  };
}

const agent = {
  name: "TECS AGENT",
  address: "HN",
  tel: "024",
  email: "a@x.com",
  vat: "010",
  fax: "",
};
const registrant = { name: "NV A", tel: "0901", cccd: "001" };

describe("esidDeclareFields — một nguồn cho Excel + fill", () => {
  it("esidTotalHawbs", () => {
    expect(esidTotalHawbs({})).toBe(0);
    expect(esidTotalHawbs({ hawb: "  " })).toBe(0);
    expect(esidTotalHawbs({ hawb: "H1" })).toBe(1);
  });

  it("Excel row và fill payload cùng payment_mode / party / hawbs", () => {
    const s = base({ hawb: "H99" });
    const core = buildEsidDeclareCoreFields(s, registrant, agent);
    const row = shipmentToEsidDeclareRow(s, registrant, agent);
    const fill = buildEsidDeclareFillPayload(s, registrant, agent);

    expect(core.payment_mode).toBe(ESID_DEFAULT_PAYMENT_MODE);
    expect(row.PAYMENT_MODE).toBe(core.payment_mode);
    expect(fill?.shipment.payment_mode).toBe(core.payment_mode);

    expect(core.total_hawbs).toBe(1);
    expect(row.TOTAL_HAWBS).toBe(1);
    expect(fill?.shipment.total_hawbs).toBe(1);

    expect(row.SHIPPER_NAME).toBe(fill?.shipment.shipper_name);
    expect(row.AGENT_NAME).toBe(fill?.shipment.agent_name);
    expect(row.CONSIGNEE_NAME).toBe(fill?.shipment.consignee_name);
    expect(row.REGISTRANT_CCCD).toBe(fill?.registrant.cccd);
  });
});
