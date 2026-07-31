import { describe, expect, it } from "vitest";
import {
  buildFlightLabelMapForEditor,
  overridesFromEffectiveMaps,
  syntheticAirlineLabelName,
} from "./airlineLabelOverridesCore";
import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "../constants/airlineLabelDefaults";
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

describe("overridesFromEffectiveMaps", () => {
  it("rỗng khi trùng hoàn toàn bảng mặc định", () => {
    const o = overridesFromEffectiveMaps(
      { ...DEFAULT_AIRLINE_BY_AWB_PREFIX },
      { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX }
    );
    expect(Object.keys(o.byAwbPrefix)).toHaveLength(0);
    expect(Object.keys(o.byFlightPrefix)).toHaveLength(0);
  });

  it("chỉ lưu key đã đổi tên", () => {
    const awb = { ...DEFAULT_AIRLINE_BY_AWB_PREFIX, "978": "VIETJET CUSTOM" };
    const o = overridesFromEffectiveMaps(awb, { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX });
    expect(o.byAwbPrefix["978"]).toBe("VIETJET CUSTOM");
    expect(Object.keys(o.byAwbPrefix)).toHaveLength(1);
  });

  it("lưu prefix chuyến mới không có trong mặc định", () => {
    const flt = { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, XX: "NEW AIR" };
    const o = overridesFromEffectiveMaps({ ...DEFAULT_AIRLINE_BY_AWB_PREFIX }, flt);
    expect(o.byFlightPrefix.XX).toBe("NEW AIR");
  });

  it("giữ khoảng trắng trong tên khi lưu ghi đè", () => {
    const flt = { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, TR: "Singapore airlines" };
    const o = overridesFromEffectiveMaps({}, flt);
    expect(o.byFlightPrefix.TR).toBe("Singapore airlines");
  });

  it("không lưu fallback tổng hợp XX AIRLINES như ghi đè", () => {
    const flt = { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, ZZ: syntheticAirlineLabelName("ZZ") };
    const o = overridesFromEffectiveMaps({}, flt);
    expect(o.byFlightPrefix.ZZ).toBeUndefined();
  });
});

describe("buildFlightLabelMapForEditor + tem TR", () => {
  it("TR mặc định SCOOT; đổi sang Singapore airlines thì tem khớp", () => {
    expect(DEFAULT_AIRLINE_BY_FLIGHT_PREFIX.TR).toBe("SCOOT");
    const before = mapShipmentToAirCargoLabelData(baseShipment({ flight: "TR305" }));
    expect(before.airline).toBe("SCOOT");

    const saved = overridesFromEffectiveMaps(
      {},
      { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, TR: "Singapore airlines" }
    );
    expect(saved.byFlightPrefix.TR).toBe("Singapore airlines");

    const after = mapShipmentToAirCargoLabelData(baseShipment({ flight: "TR305" }), saved);
    expect(after.airline).toBe("Singapore airlines");
  });

  it("prefix chỉ có trên lô (không trong mặc định) vẫn vào editor với tên fallback", () => {
    const map = buildFlightLabelMapForEditor(undefined, ["XY123", "VN773"]);
    expect(map.VN).toBe("VIETNAM AIRLINES");
    expect(map.XY).toBe("XY AIRLINES");
  });
});
