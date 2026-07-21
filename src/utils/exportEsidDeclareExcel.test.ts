import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  analyzeShipmentForEsidDeclare,
  flightDateToYmd,
  shipmentToEsidDeclareRow,
  ymdToDmy,
} from "./exportEsidDeclareExcel";

function base(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "s1",
    stt: 1,
    sessionDate: "2026-07-20",
    awb: "738-0718 3061",
    flight: "VN0773",
    flightDate: "21JUL",
    cutoff: "",
    cutoffNote: "",
    note: "test",
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
    shipperPhonePrint: "0901",
    shipperEmailPrint: "a@x.com",
    consigneeNamePrint: "BUYER B",
    consigneeAddressPrint: "SEOUL",
    goodsDescriptionPrint: "GARMENT",
    ...over,
  };
}

describe("exportEsidDeclareExcel", () => {
  it("flightDateToYmd + ymdToDmy", () => {
    expect(flightDateToYmd("21JUL", "2026-07-20")).toBe("2026-07-21");
    expect(ymdToDmy("2026-07-21")).toBe("21-07-2026");
  });

  it("maps Ops shipment → Excel row", () => {
    const row = shipmentToEsidDeclareRow(base());
    expect(row.AWB).toBe("73807183061");
    expect(row.FLIGHT_NO).toBe("VN0773");
    expect(row.FLIGHT_DATE).toBe("2026-07-21");
    expect(row.DEST).toBe("ICN");
    expect(row.PCS).toBe(2);
    expect(row.GROSS_WEIGHT).toBe(45.5);
    expect(row.SHIPPER_NAME).toBe("CONG TY A");
    expect(row.CONSIGNEE_NAME).toBe("BUYER B");
    expect(row.SUBMIT).toBe(0);
    expect(row.TECS_WAREHOUSE).toBe(1);
  });

  it("readiness flags missing party fields", () => {
    const a = analyzeShipmentForEsidDeclare(
      base({
        customer: "",
        shipperNamePrint: "",
        shipperAddressPrint: "",
        consigneeNamePrint: "",
        consigneeAddressPrint: "",
      })
    );
    expect(a.canDryFill).toBe(false);
    expect(a.missingForFill).toEqual(
      expect.arrayContaining(["SHIPPER_NAME", "SHIPPER_ADDRESS", "CONSIGNEE_NAME", "CONSIGNEE_ADDRESS"])
    );
  });

  it("ready when core + party filled", () => {
    const a = analyzeShipmentForEsidDeclare(base());
    expect(a.canDryFill).toBe(true);
    expect(a.missingForSubmit).toEqual(["REGISTRANT_NAME", "REGISTRANT_TEL", "REGISTRANT_CCCD"]);
  });
});
