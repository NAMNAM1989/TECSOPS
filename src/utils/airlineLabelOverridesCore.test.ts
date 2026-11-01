import { describe, expect, it } from "vitest";
import { mergeAirlineLookupMaps } from "./airlineLabelOverridesCore";
import { mapShipmentToAirCargoLabelData } from "./mapShipmentToAirCargoLabelData";
import type { Shipment } from "../types/shipment";

function baseShipment(patch: Partial<Shipment>): Shipment {
  return {
    id: "1",
    stt: 1,
    sessionDate: "2026-07-13",
    awb: "618-1234 5678",
    hawb: "",
    flight: "TR305",
    flightDate: "13JUL",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SIN",
    warehouse: "TECS-TCS",
    pcs: 1,
    kg: 10,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "TEST",
    customerCode: "",
    customerId: "",
    customerShipperId: "",
    customerConsigneeId: "",
    customerGoodsId: "",
    globalAgentId: "",
    status: "PENDING",
    goodsDescriptionPrint: "",
    otherRequirementsPrint: "",
    shipperNamePrint: "",
    shipperAddressPrint: "",
    shipperPhonePrint: "",
    shipperEmailPrint: "",
    taxCodePrint: "",
    agentNamePrint: "",
    agentAddressPrint: "",
    agentPhonePrint: "",
    agentEmailPrint: "",
    agentTaxCodePrint: "",
    consigneeNamePrint: "",
    consigneeAddressPrint: "",
    consigneePhonePrint: "",
    consigneeEmailPrint: "",
    notifyNamePrint: "",
    ...patch,
  };
}

describe("mergeAirlineLookupMaps replaceDefaults", () => {
  it("catalog Supabase không merge defaults cứng", () => {
    const maps = mergeAirlineLookupMaps(
      { byAwbPrefix: { "738": "Vietnam Airlines" }, byFlightPrefix: { VN: "Vietnam Airlines" } },
      { replaceDefaults: true }
    );
    expect(maps.byFlight.VN).toBe("Vietnam Airlines");
    expect(maps.byFlight.TR).toBeUndefined();
    expect(maps.byAwb["738"]).toBe("Vietnam Airlines");
  });
});

describe("tem theo catalog", () => {
  it("tem dùng catalog replaceDefaults", () => {
    const catalog = {
      byAwbPrefix: { "738": "Vietnam Airlines" },
      byFlightPrefix: { VN: "Vietnam Airlines" },
    };
    const d = mapShipmentToAirCargoLabelData(
      baseShipment({ flight: "VN773", awb: "738-1234 5678" }),
      catalog,
      { replaceDefaults: true }
    );
    expect(d.airline).toBe("Vietnam Airlines");
  });
});
