import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { resolveShipmentForEsidDeclare } from "./resolveShipmentForEsidDeclare";

function shipment(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-07-20",
    awb: "73807183061",
    flight: "VN0773",
    flightDate: "21JUL",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "ICN",
    warehouse: "TECS-TCS",
    pcs: 2,
    kg: 40,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "PCS",
    customerCode: "PCS",
    customerId: "c-pcs",
    ...over,
  };
}

function customerPcs(): CustomerDirectoryEntry {
  return {
    id: "c-pcs",
    code: "PCS",
    name: "PCS CO LTD",
    defaultShipperId: "sh1",
    defaultConsigneeId: "cn1",
    defaultGoodsId: "g1",
    savedShippers: [
      {
        id: "sh1",
        label: "HCM",
        shipperName: "PCS SHIPPER HCM",
        shipperAddress: "Q7 HCMC",
        shipperPhone: "0901",
        shipperEmail: "s@pcs.com",
        taxCode: "031234",
      },
    ],
    savedConsignees: [
      {
        id: "cn1",
        label: "ICN",
        consigneeName: "PCS CNEE SEOUL",
        consigneeAddress: "SEOUL KR",
        consigneePhone: "8201",
        consigneeEmail: "c@pcs.com",
        notifyName: "NOTIFY PCS",
      },
    ],
    savedGoods: [
      {
        id: "g1",
        label: "Garment",
        goodsDescription: "GARMENT ACCESSORIES",
      },
    ],
  };
}

describe("resolveShipmentForEsidDeclare", () => {
  it("chọn Shipper/CNEE/Goods từ hồ sơ khách PCS, giữ pcs/awb Ops", () => {
    const r = resolveShipmentForEsidDeclare(shipment(), [customerPcs()]);
    expect(r.customerLabel).toBe("PCS");
    expect(r.shipperFromProfile).toBe(true);
    expect(r.consigneeFromProfile).toBe(true);
    expect(r.goodsFromProfile).toBe(true);
    expect(r.shipment.shipperNamePrint).toBe("PCS SHIPPER HCM");
    expect(r.shipment.consigneeNamePrint).toBe("PCS CNEE SEOUL");
    expect(r.shipment.goodsDescriptionPrint).toBe("GARMENT ACCESSORIES");
    expect(r.shipment.pcs).toBe(2);
    expect(r.shipment.awb).toBe("73807183061");
    expect(r.shipment.dest).toBe("ICN");
  });

  it("tôn trọng customerShipperId khi khách có nhiều shipper", () => {
    const cust = customerPcs();
    cust.savedShippers!.push({
      id: "sh2",
      label: "HN",
      shipperName: "PCS SHIPPER HN",
      shipperAddress: "HN",
      shipperPhone: "0902",
      shipperEmail: "",
      taxCode: "",
    });
    cust.defaultShipperId = "sh1";
    const r = resolveShipmentForEsidDeclare(
      shipment({ customerShipperId: "sh2" }),
      [cust]
    );
    expect(r.shipment.shipperNamePrint).toBe("PCS SHIPPER HN");
  });

  it("không khớp danh bạ → warning + giữ snapshot lô", () => {
    const r = resolveShipmentForEsidDeclare(
      shipment({
        customerId: "",
        customerCode: "UNKNOWN",
        customer: "UNKNOWN",
        shipperNamePrint: "SNAP SHIPPER",
      }),
      [customerPcs()]
    );
    expect(r.customer).toBeUndefined();
    expect(r.shipperFromProfile).toBe(false);
    expect(r.shipment.shipperNamePrint).toBe("SNAP SHIPPER");
    expect(r.warnings.some((w) => /Không khớp danh bạ/i.test(w))).toBe(true);
  });

  it("không cảnh báo Agent theo lô (Agent ESID cố định ngoài resolve)", () => {
    const r = resolveShipmentForEsidDeclare(shipment({ agentNamePrint: "" }), [customerPcs()]);
    expect(r.warnings.some((w) => /Agent trên lô/i.test(w))).toBe(false);
  });
});
