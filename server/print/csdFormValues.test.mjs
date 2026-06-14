import { describe, expect, it } from "vitest";
import {
  buildCsdValuesFromShipment,
  formatCsdDate,
  sessionYmdToCsdDateToken,
} from "./csdFormValues.mjs";

describe("csdFormValues", () => {
  it("sessionYmdToCsdDateToken", () => {
    expect(sessionYmdToCsdDateToken("2026-06-13")).toBe("13JUN26");
  });

  it("buildCsdValuesFromShipment", () => {
    const values = buildCsdValuesFromShipment(
      {
        awb: "235-4501 1960",
        dest: "AMS",
        flight: "TK163",
        flightDate: "14JUN",
        sessionDate: "2026-06-13",
        warehouse: "TECS-TCS",
        pcs: 78,
        kg: 1258,
        customer: "TÍN PHÁT",
        goodsDescriptionPrint: "GARMENTS",
        consigneeNamePrint: "VERTEX E COMMERCE B.V.",
        hawb: "",
        note: "",
      },
      {
        now: new Date("2026-06-13T14:30:00+07:00"),
        issuedByName: "NGUYEN A",
      }
    );

    expect(values.uniqueConsignmentId).toBe("235-4501 1960");
    expect(values.origin).toBe("SGN");
    expect(values.destination).toBe("AMS");
    expect(values.securityStatus).toBe("SPX");
    expect(values.screeningMethod).toBe("X-ray");
    expect(values.raCategoryIdentifier).toContain("RA");
    expect(values.contentsOfConsignment).toBe("GARMENTS");
    expect(values.issuedDate).toBe("13JUN26");
    expect(values.issuedTime).toMatch(/^\d{4}$/);
    expect(values.additionalSecurityInfo).toContain("TK163");
  });

  it("formatCsdDate", () => {
    expect(formatCsdDate(new Date("2026-06-13T10:00:00"))).toBe("13JUN26");
  });
});
