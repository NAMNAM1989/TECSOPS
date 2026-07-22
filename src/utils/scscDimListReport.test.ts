import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { lineDimKg, totalDimKgFromLines } from "./volumetricDim";
import {
  buildScscDimListModel,
  dimKgExcelLineNumFmt,
  scscDimDivisor,
} from "./scscDimListReport";

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
  });

  it("KHO SCSC dùng cùng model SCSC", () => {
    const m = buildScscDimListModel(sample({ warehouse: "TECS-SCSC" }));
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
    const div = scscDimDivisor(s);
    const kg = lineDimKg(s.dimLines![0]!, div, m!.dimCtx);
    expect(m!.rows).toHaveLength(1);
    expect(m!.rows[0]!.dimKg).toBe(kg);
    expect(m!.totalPcs).toBe(4);
  });

  it("VJ: Excel numFmt dòng 3 số lẻ", () => {
    const s = sample({ flight: "VJ999", dimLines: [{ lCm: 10, wCm: 10, hCm: 10, pcs: 1 }] });
    const m = buildScscDimListModel(s);
    expect(m).not.toBeNull();
    expect(m!.rule?.lineRound).toBe("TRUNCATE_3DP");
    expect(dimKgExcelLineNumFmt(m!.rule?.lineRound)).toBe("0.000");
  });

  it("dimDivisor null: dùng hệ số suy từ mã chuyến", () => {
    const s = sample({ dimDivisor: null });
    expect(scscDimDivisor(s)).toBe(6000);
  });

  it("dimKgStrip header = tổng tính từ dimLines", () => {
    const s = sample({ dimWeightKg: 999 });
    const m = buildScscDimListModel(s);
    expect(m).not.toBeNull();
    const policy = m!.dimCtx;
    const total = totalDimKgFromLines(s.dimLines!, scscDimDivisor(s), policy);
    expect(m!.dimKgStrip).toContain(String(total));
    expect(m!.dimKgStrip).not.toContain("999");
  });

  it("giữ cờ estimated trên dòng model", () => {
    const m = buildScscDimListModel(
      sample({
        dimLines: [
          { lCm: 35, wCm: 35, hCm: 35, pcs: 1 },
          { lCm: 30, wCm: 25, hCm: 20, pcs: 3, estimated: true },
        ],
      })
    );
    expect(m).not.toBeNull();
    expect(m!.rows[0]!.estimated).toBeFalsy();
    expect(m!.rows[1]!.estimated).toBe(true);
  });
});
