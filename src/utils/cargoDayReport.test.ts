import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "./blankShipment";
import {
  buildCargoDayReport,
  formatCargoReportBooking,
  formatCargoReportCutoff,
  formatCargoReportFlightDate,
  formatCargoReportTitleDate,
} from "./cargoDayReport";

function lot(
  partial: Partial<Shipment> & Pick<Shipment, "id" | "warehouse">,
): Shipment {
  return {
    ...blankShipmentDraft("2026-07-27", partial.warehouse),
    stt: 1,
    ...partial,
  };
}

describe("cargoDayReport", () => {
  it("title date DDMMMYYYY", () => {
    expect(formatCargoReportTitleDate("2026-07-27")).toBe("27JUL2026");
  });

  it("Booking = AWB", () => {
    expect(formatCargoReportBooking({ awb: "17612345675" })).toBe("17612345675");
    expect(formatCargoReportBooking({ awb: "  " })).toBe("—");
  });

  it("flight/date gộp", () => {
    expect(
      formatCargoReportFlightDate({ flight: "QH201", flightDate: "27JUL" }),
    ).toBe("QH201 / 27JUL");
  });

  it("ẩn kho trống và lấy mọi lô ngày phiên", () => {
    const rows = [
      lot({
        id: "a",
        warehouse: "TECS-TCS",
        awb: "17611111111",
        flight: "VN600",
        flightDate: "27JUL",
        dest: "SGN",
        cutoff: new Date(2026, 6, 27, 17, 0).toISOString(),
      }),
      lot({
        id: "b",
        warehouse: "TECS-TCS",
        awb: "17622222222",
        dest: "HAN",
        sessionDate: "2026-07-26",
      }),
    ];
    const model = buildCargoDayReport(rows, "2026-07-27");
    expect(model.totalLots).toBe(1);
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0]!.warehouse).toBe("TECS-TCS");
    expect(model.sections[0]!.rows[0]!.booking).toBe("17611111111");
    expect(model.sections.some((s) => s.warehouse === "TECS-SCSC")).toBe(false);
  });

  it("tách TCS và SCSC, ẩn khối 0", () => {
    const rows = [
      lot({ id: "t", warehouse: "TECS-TCS", awb: "17611111111", dest: "SGN" }),
      lot({ id: "s", warehouse: "TECS-SCSC", awb: "16099999999", dest: "ICN" }),
    ];
    const model = buildCargoDayReport(rows, "2026-07-27");
    expect(model.totalLots).toBe(2);
    expect(model.sections.map((s) => s.warehouse)).toEqual([
      "TECS-TCS",
      "TECS-SCSC",
    ]);
  });

  it("format cutoff display", () => {
    const iso = new Date(2026, 3, 15, 17, 0).toISOString();
    expect(formatCargoReportCutoff({ cutoff: iso, cutoffNote: "" })).toMatch(
      /17H/,
    );
    expect(formatCargoReportCutoff({ cutoff: "", cutoffNote: "PER" })).toBe(
      "PER",
    );
  });
});
