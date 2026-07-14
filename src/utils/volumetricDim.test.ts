import { describe, expect, it } from "vitest";
import {
  applyQrOneDecimalRule,
  applyScscChargeableRounding,
  resolveScscAirlineDimRule,
  scscChargeableKindFromShipment,
} from "./scscChargeableWeight";
import {
  dimDivisorFromFlight,
  dimRoundingPolicyFromFlight,
  formatDimKgDisplay,
  formatShipmentDimWeightKg,
  lineDimKg,
  parseDimLineQuadsFromNumbersStrict,
  totalDimKgFromLines,
  tryParseDimPieceLinesFromComboText,
} from "./volumetricDim";

describe("parseDimLineQuadsFromNumbersStrict", () => {
  it("từ chối khi còn số thừa (không đủ bộ 3/4)", () => {
    expect(parseDimLineQuadsFromNumbersStrict([40, 50, 30, 4, 5])).toBeNull();
    expect(parseDimLineQuadsFromNumbersStrict([40, 50])).toBeNull();
  });

  it("chấp nhận một nhóm 4 số hoặc 3 số", () => {
    expect(parseDimLineQuadsFromNumbersStrict([40, 50, 30, 4])).toEqual([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 4 },
    ]);
    expect(parseDimLineQuadsFromNumbersStrict([40, 50, 30])).toEqual([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
    ]);
  });

  it("hai nhóm trên một dòng", () => {
    expect(parseDimLineQuadsFromNumbersStrict([40, 50, 30, 4, 60, 50, 30, 5])).toEqual([
      { lCm: 40, wCm: 50, hCm: 30, pcs: 4 },
      { lCm: 60, wCm: 50, hCm: 30, pcs: 5 },
    ]);
  });
});

describe("tryParseDimPieceLinesFromComboText", () => {
  it("nhiều dòng dấu gạch (desktop dán nhanh)", () => {
    const r = tryParseDimPieceLinesFromComboText(`40-50-30-4
60-50-30-5`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toEqual([
        { lCm: 40, wCm: 50, hCm: 30, pcs: 4 },
        { lCm: 60, wCm: 50, hCm: 30, pcs: 5 },
      ]);
    }
  });

  it("tách dòng bằng ;", () => {
    const r = tryParseDimPieceLinesFromComboText("40-50-30-4;60-50-30-5");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toHaveLength(2);
    }
  });

  it("một dòng × như cũ", () => {
    const r = tryParseDimPieceLinesFromComboText("120×50×30×4");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toEqual([{ lCm: 120, wCm: 50, hCm: 30, pcs: 4 }]);
    }
  });
});

describe("dimDivisorFromFlight", () => {
  it("mặc định 6000 (IATA) — SCSC Required airline không nêu 5000", () => {
    expect(dimDivisorFromFlight("VN601")).toBe(6000);
    expect(dimDivisorFromFlight("QH202")).toBe(6000);
    expect(dimDivisorFromFlight("VJ123")).toBe(6000);
  });
});

describe("SCSC Required airline — resolve + rounding", () => {
  it("VJ / AWB 978 → DP3_ROUND_0_5", () => {
    expect(dimRoundingPolicyFromFlight("VJ123")).toBe("DP3_ROUND_0_5");
    expect(scscChargeableKindFromShipment("", "978-1111 2222")).toBe("DP3_ROUND_0_5");
    expect(resolveScscAirlineDimRule("VJ081")?.codes).toContain("VJ");
  });

  it("TK / SQ / TR → làm tròn bậc 1 (SQ+TR cùng 618)", () => {
    expect(dimRoundingPolicyFromFlight("TK001")).toBe("DP3_ROUND_1");
    expect(dimRoundingPolicyFromFlight("SQ177")).toBe("DP3_ROUND_1");
    expect(dimRoundingPolicyFromFlight("TR305")).toBe("DP3_ROUND_1");
    expect(resolveScscAirlineDimRule("SQ177")?.codes).toEqual(["SQ", "TR"]);
    expect(resolveScscAirlineDimRule("TR305")?.codes).toEqual(["SQ", "TR"]);
    expect(scscChargeableKindFromShipment("", "618-1234 5678")).toBe("DP3_ROUND_1");
  });

  it("CX/LD → 2 số lẻ + 0.5", () => {
    expect(dimRoundingPolicyFromFlight("CX766")).toBe("DP2_ROUND_0_5");
    expect(dimRoundingPolicyFromFlight("LD562")).toBe("DP2_ROUND_0_5");
  });

  it("TG / 6E / BD → làm tròn số nguyên", () => {
    expect(dimRoundingPolicyFromFlight("TG610")).toBe("ROUND_INTEGER");
    expect(dimRoundingPolicyFromFlight("6E123")).toBe("ROUND_INTEGER");
    expect(dimRoundingPolicyFromFlight("BD100")).toBe("ROUND_INTEGER");
  });

  it("QR → QR_SPECIAL", () => {
    expect(dimRoundingPolicyFromFlight("QR846")).toBe("QR_SPECIAL");
    expect(scscChargeableKindFromShipment("", "157-1234 5678")).toBe("QR_SPECIAL");
  });

  it("hãng lạ → STANDARD_IATA_2DP", () => {
    expect(dimRoundingPolicyFromFlight("VN601")).toBe("STANDARD_IATA_2DP");
    expect(dimRoundingPolicyFromFlight("")).toBe("STANDARD_IATA_2DP");
  });

  it("DP3_ROUND_0_5: 10.234 → 10.0; 10.3 → 10.5", () => {
    expect(applyScscChargeableRounding(10.234, "DP3_ROUND_0_5")).toBe(10);
    expect(applyScscChargeableRounding(10.3, "DP3_ROUND_0_5")).toBe(10.5);
  });

  it("QR one-decimal rule", () => {
    expect(applyQrOneDecimalRule(10.0)).toBe(10);
    expect(applyQrOneDecimalRule(10.14)).toBe(10.5);
    expect(applyQrOneDecimalRule(10.49)).toBe(10.5);
    expect(applyQrOneDecimalRule(10.5)).toBe(11);
    expect(applyQrOneDecimalRule(10.91)).toBe(11);
  });
});

describe("DIM theo chính sách VJ (SCSC: 3 số lẻ → làm tròn 0.5)", () => {
  const div = 6000 as const;
  const line = { lCm: 77, wCm: 58, hCm: 42, pcs: 3 };

  it("VJ: dòng làm tròn bậc 0.5, khác IATA 2dp", () => {
    const raw = ((77 * 58 * 42) / div) * 3;
    const vj = lineDimKg(line, div, "DP3_ROUND_0_5");
    const std = lineDimKg(line, div, "STANDARD_IATA_2DP");
    expect(vj).not.toBe(std);
    expect(vj).toBe(applyScscChargeableRounding(raw, "DP3_ROUND_0_5"));
  });

  it("VJ: tổng = tổng dòng đã làm tròn (bậc 0.5)", () => {
    const lines = [
      { lCm: 77, wCm: 58, hCm: 42, pcs: 3 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
    ];
    const a = lineDimKg(lines[0], div, "DP3_ROUND_0_5")!;
    const b = lineDimKg(lines[1], div, "DP3_ROUND_0_5")!;
    const tot = totalDimKgFromLines(lines, div, "DP3_ROUND_0_5")!;
    expect(tot).toBe(a + b);
  });
});

describe("formatDimKgDisplay / formatShipmentDimWeightKg", () => {
  it("VJ: hiển thị 1 số lẻ sau làm tròn 0.5", () => {
    expect(formatDimKgDisplay(10.5, "DP3_ROUND_0_5")).toBe("10.5");
    expect(formatShipmentDimWeightKg("VJ081", 10.5)).toBe("10.5");
  });

  it("IATA: 2 số lẻ", () => {
    expect(formatShipmentDimWeightKg("VN601", 139.205)).toBe("139.21");
  });
});
