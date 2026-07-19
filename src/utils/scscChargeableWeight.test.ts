import { describe, expect, it } from "vitest";
import {
  applyQrOneDecimalRule,
  applyScscLineDimRounding,
  applyScscTotalDimRounding,
  ceilToStep,
  resolveScscAirlineDimRule,
  truncatePositiveKg,
} from "./scscChargeableWeight";
import { SCSC_AIRLINE_DIM_RULES } from "../constants/scscAirlineChargeableRules";

describe("scscChargeableWeight catalog", () => {
  it("đủ hãng trong file Required airline", () => {
    expect(SCSC_AIRLINE_DIM_RULES.length).toBeGreaterThanOrEqual(30);
  });

  it("14JUL2026: CO, 9A, BI, SQ/TR tách rule", () => {
    expect(resolveScscAirlineDimRule("CO101", "921-1111 2222")?.codes).toEqual(["CO"]);
    expect(resolveScscAirlineDimRule("9A100")?.codes).toEqual(["9A"]);
    expect(resolveScscAirlineDimRule("BI201", "672-1111 2222")?.maxDimsCm).toEqual({
      l: 163,
      w: 149,
      h: 119,
    });
    expect(resolveScscAirlineDimRule("SQ177", "618-1111 2222")?.codes).toEqual(["SQ"]);
    expect(resolveScscAirlineDimRule("TR305", "618-1111 2222")?.codes).toEqual(["TR"]);
    expect(resolveScscAirlineDimRule("SQ177")?.maxDimsCm).toBeUndefined();
    expect(resolveScscAirlineDimRule("TR305")?.maxDimsCm).toEqual({
      l: 150,
      w: 130,
      h: 110,
    });
  });

  it("VJ / SQ / TR lineRound + totalRound", () => {
    expect(resolveScscAirlineDimRule("VJ123")).toMatchObject({
      lineRound: "TRUNCATE_3DP",
      totalRound: "ROUND_0_5",
    });
    expect(resolveScscAirlineDimRule("SQ177")).toMatchObject({
      lineRound: "TRUNCATE_3DP",
      totalRound: "ROUND_1",
    });
    expect(resolveScscAirlineDimRule("TR305")).toMatchObject({
      lineRound: "TRUNCATE_3DP",
      totalRound: "ROUND_1",
    });
  });
});

describe("SCSC airline.1.xlsx — ví dụ làm tròn", () => {
  it("dòng: cắt 3 số lẻ (20,5556 → 20,555)", () => {
    expect(applyScscLineDimRounding(20.5556, "TRUNCATE_3DP")).toBe(20.555);
  });

  it("tổng: làm tròn 0.5 (100,104 → 100,5; 100,546 → 101)", () => {
    expect(applyScscTotalDimRounding(100.104, "ROUND_0_5")).toBe(100.5);
    expect(applyScscTotalDimRounding(100.546, "ROUND_0_5")).toBe(101);
  });

  it("SQ/TR tổng: làm tròn 1 (100,123 → 100; 100,567 → 101)", () => {
    expect(applyScscTotalDimRounding(100.123, "ROUND_1")).toBe(100);
    expect(applyScscTotalDimRounding(100.567, "ROUND_1")).toBe(101);
  });

  it("6E dòng + tổng: làm tròn số", () => {
    expect(applyScscLineDimRounding(20.5556, "ROUND_INTEGER")).toBe(21);
    expect(applyScscLineDimRounding(20.2565, "ROUND_INTEGER")).toBe(20);
  });

  it("CX dòng: cắt 2 số lẻ (20,5556 → 20,55)", () => {
    expect(applyScscLineDimRounding(20.5556, "TRUNCATE_2DP")).toBe(20.55);
  });

  it("QR dòng: cắt 1 số lẻ (20,5556 → 20,5)", () => {
    expect(applyScscLineDimRounding(20.5556, "QR_LINE")).toBe(20.5);
    expect(truncatePositiveKg(20.5556, 1)).toBe(20.5);
  });

  it("ceilToStep khớp ví dụ tổng", () => {
    expect(ceilToStep(truncatePositiveKg(100.104, 3), 0.5)).toBe(100.5);
    expect(ceilToStep(truncatePositiveKg(100.546, 3), 0.5)).toBe(101);
  });
});
