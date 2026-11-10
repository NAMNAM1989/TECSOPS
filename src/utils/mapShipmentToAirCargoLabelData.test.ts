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

  it("lịch SCSC mùa đông: TR in cùng tên với SQ, và nhận các mã chuyến mới", () => {
    expect(mapShipmentToAirCargoLabelData(baseShipment({ flight: "SQ185" })).airline).toBe(
      "SINGAPORE AIRLINES"
    );
    expect(mapShipmentToAirCargoLabelData(baseShipment({ flight: "TR503" })).airline).toBe(
      "SINGAPORE AIRLINES"
    );
    const byFlight: Record<string, string> = {
      "3U3904": "SICHUAN AIRLINES",
      "5X067": "UPS AIRLINES",
      "9G400": "SUN PHUQUOC AIRWAYS",
      BI382: "ROYAL BRUNEI AIRLINES",
      CO9632: "NORTH-WESTERN CARGO",
      CV7856: "CARGOLUX",
      LD562: "AIR HONG KONG",
      MF842: "XIAMEN AIRLINES",
      O3318: "SF AIRLINES",
      TH237: "RAYA AIRWAYS",
      VU311: "VIETRAVEL AIRLINES",
    };
    for (const [flight, airline] of Object.entries(byFlight)) {
      const d = mapShipmentToAirCargoLabelData(baseShipment({ flight }));
      expect(`${flight} ${d.airline} known=${d.airlineKnown}`).toBe(`${flight} ${airline} known=true`);
    }
  });

  it("đầu AWB của hãng mới trên lịch SCSC", () => {
    expect(
      mapShipmentToAirCargoLabelData(baseShipment({ flight: "", awb: "921-1234 5675" })).airline
    ).toBe("SF AIRLINES");
    expect(
      mapShipmentToAirCargoLabelData(baseShipment({ flight: "", awb: "618-1234 5675" })).airline
    ).toBe("SINGAPORE AIRLINES");
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

  it("thiếu T5 trong catalog (cache cũ) → in mã hãng T5, đánh dấu chưa biết", () => {
    const d = mapShipmentToAirCargoLabelData(
      baseShipment({ flight: "T5123", awb: "542-1234 5678" }),
      { byAwbPrefix: {}, byFlightPrefix: {} },
      { replaceDefaults: true }
    );
    expect(d.airline).toBe("T5");
    expect(d.airlineKnown).toBe(false);
  });
});
