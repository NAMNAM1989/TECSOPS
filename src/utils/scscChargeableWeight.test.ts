import { describe, expect, it } from "vitest";
import {
  applyQrOneDecimalRule,
  applyScscChargeableRounding,
  applyScscTotalRounding,
  resolveScscAirlineDimRule,
} from "./scscChargeableWeight";
import { SCSC_AIRLINE_DIM_RULES } from "../constants/scscAirlineChargeableRules";

describe("scscChargeableWeight catalog", () => {
  it("đủ hãng trong file Required airline (32 dòng data)", () => {
    expect(SCSC_AIRLINE_DIM_RULES.length).toBeGreaterThanOrEqual(30);
  });

  it("3U / 5X / 6E / 7C resolve từ mã chuyến số+chữ", () => {
    expect(resolveScscAirlineDimRule("3U888")?.codes).toContain("3U");
    expect(resolveScscAirlineDimRule("5X101")?.codes).toContain("5X");
    expect(resolveScscAirlineDimRule("6E201")?.codes).toContain("6E");
    expect(resolveScscAirlineDimRule("7C110")?.codes).toContain("7C");
  });
});

describe("applyScscChargeableRounding", () => {
  it("DP3_ROUND_1", () => {
    expect(applyScscChargeableRounding(10.4, "DP3_ROUND_1")).toBe(10);
    expect(applyScscChargeableRounding(10.6, "DP3_ROUND_1")).toBe(11);
  });

  it("ROUND_INTEGER", () => {
    expect(applyScscChargeableRounding(10.4, "ROUND_INTEGER")).toBe(10);
    expect(applyScscChargeableRounding(10.5, "ROUND_INTEGER")).toBe(11);
  });

  it("QR total làm tròn 0.5", () => {
    expect(applyScscTotalRounding(10.2, "QR_SPECIAL")).toBe(10);
    expect(applyScscTotalRounding(10.3, "QR_SPECIAL")).toBe(10.5);
    expect(applyQrOneDecimalRule(12.35)).toBe(12.5);
  });
});
