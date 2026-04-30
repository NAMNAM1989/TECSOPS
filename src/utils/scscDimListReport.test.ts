import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { dimDivisorFromFlight, dimRoundingPolicyFromFlight, lineDimKg } from "./volumetricDim";
import { buildScscDimListModel, dimKgExcelNumFmt, scscDimDivisor } from "./scscDimListReport";

function sample(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "x",
    stt: 1,
    sessionDate: "2026-04-06",
    awb: "232-0000 0000",
    flight: "VN1",
    flightDate: "01JAN",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "HAN",
    warehouse: "TECS-SCSC",
    pcs: 5,
    kg: 10,
    dimWeightKg: 120,
    dimDivisor: 6000,
    dimLines: [{ lCm: 120, wCm: 50, hCm: 30, pcs: 4 }],
    customer: "C",
    customerCode: "",
    status: "RECEIVED",
    ...over,
  };
}

describe("buildScscDimListModel", () => {
  it("null khi không phải SCSC", () => {
    expect(buildScscDimListModel(sample({ warehouse: "TECS-TCS" }))).toBeNull();
    expect(buildScscDimListModel(sample({ warehouse: "KHO-TCS" }))).toBeNull();
  });

  it("KHO SCSC dùng cùng model SCSC", () => {
    const m = buildScscDimListModel(sample({ warehouse: "KHO-SCSC" }));
    expect(m).not.toBeNull();
    expect(m!.totalPcs).toBe(4);
  });

  it("null khi không có dimLines", () => {
    expect(buildScscDimListModel(sample({ dimLines: null }))).toBeNull();
  });

  it("DIM từng dòng khớp lineDimKg + chính sách chuyến", () => {
    const s = sample();
    const m = buildScscDimListModel(s);
    expect(m).not.toBeNull();
    const policy = dimRoundingPolicyFromFlight(s.flight);
    const div = scscDimDivisor(s);
    const kg = lineDimKg(s.dimLines![0]!, div, policy);
    expect(m!.rows).toHaveLength(1);
    expect(m!.rows[0]!.dimKg).toBe(kg);
    expect(m!.totalPcs).toBe(4);
  });

  it("VJ: numFmt Excel 3 chữ số thập phân", () => {
    const s = sample({ flight: "VJ999", dimLines: [{ lCm: 10, wCm: 10, hCm: 10, pcs: 1 }] });
    const m = buildScscDimListModel(s);
    expect(m).not.toBeNull();
    expect(dimKgExcelNumFmt(m!.policy)).toBe("0.000");
  });

  it("dimDivisor null: dùng hệ số suy từ mã chuyến (khớp dimDivisorFromFlight)", () => {
    const s = sample({ dimDivisor: null });
    expect(scscDimDivisor(s)).toBe(dimDivisorFromFlight(s.flight));
  });
});
