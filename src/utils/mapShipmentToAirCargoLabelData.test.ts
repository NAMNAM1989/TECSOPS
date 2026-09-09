import { describe, expect, it } from "vitest";
import {
  extractFlightAirlinePrefix,
  mapShipmentToAirCargoLabelData,
} from "./mapShipmentToAirCargoLabelData";
import type { Shipment } from "../types/shipment";

function baseShipment(patch: Partial<Shipment>): Shipment {
  return {
    id: "1",
    stt: 1,
    sessionDate: "2026-07-13",
    awb: "738-0705 3690",
    hawb: "",
    flight: "VN773",
    flightDate: "13JUL",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SYD",
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

describe("extractFlightAirlinePrefix", () => {
  it("lấy prefix từ cột chuyến", () => {
    expect(extractFlightAirlinePrefix("VN773")).toBe("VN");
    expect(extractFlightAirlinePrefix("VJ081")).toBe("VJ");
    expect(extractFlightAirlinePrefix("5J123")).toBe("5J");
    expect(extractFlightAirlinePrefix("AK523")).toBe("AK");
  });

  it("khớp prefix 3 ký tự nếu có trong bảng", () => {
    expect(extractFlightAirlinePrefix("XYZ99", { XYZ: "X" })).toBe("XYZ");
  });

  it("IATA chữ+số kiểu T5", () => {
    expect(extractFlightAirlinePrefix("T5123")).toBe("T5");
    expect(extractFlightAirlinePrefix("T5 101/09SEP", { T5: "TURKMENISTAN AIRLINES" })).toBe("T5");
  });
});

describe("mapShipmentToAirCargoLabelData airline", () => {
  it("ưu tiên prefix chuyến hơn 3 số AWB", () => {
    // AWB 738 = Vietnam Airlines mặc định; chuyến VJ = Vietjet
    const d = mapShipmentToAirCargoLabelData(
      baseShipment({ awb: "738-0705 3690", flight: "VJ081" })
    );
    expect(d.airline).toBe("VIETJET AIR");
  });

  it("VN773 → VIETNAM AIRLINES", () => {
    const d = mapShipmentToAirCargoLabelData(baseShipment({ flight: "VN773" }));
    expect(d.airline).toBe("VIETNAM AIRLINES");
  });

  it("fallback AWB khi không có chuyến", () => {
    const d = mapShipmentToAirCargoLabelData(baseShipment({ flight: "", awb: "695-5630 0484" }));
    expect(d.airline).toBe("EVA AIR");
  });

  it("T5 từ catalog Supabase → TURKMENISTAN AIRLINES", () => {
    const catalog = {
      byAwbPrefix: { "542": "TURKMENISTAN AIRLINES" },
      byFlightPrefix: { T5: "TURKMENISTAN AIRLINES" },
    };
    const byFlight = mapShipmentToAirCargoLabelData(
      baseShipment({ flight: "T5123", awb: "542-1234 5678" }),
      catalog,
      { replaceDefaults: true }
    );
    expect(byFlight.airline).toBe("TURKMENISTAN AIRLINES");

    const byAwb = mapShipmentToAirCargoLabelData(
      baseShipment({ flight: "", awb: "542-1234 5678" }),
      catalog,
      { replaceDefaults: true }
    );
    expect(byAwb.airline).toBe("TURKMENISTAN AIRLINES");
  });

  it("thiếu T5 trong catalog (cache cũ) → synthetic T5 AIRLINES", () => {
    const d = mapShipmentToAirCargoLabelData(
      baseShipment({ flight: "T5123", awb: "542-1234 5678" }),
      { byAwbPrefix: {}, byFlightPrefix: {} },
      { replaceDefaults: true }
    );
    expect(d.airline).toBe("T5 AIRLINES");
  });
});
