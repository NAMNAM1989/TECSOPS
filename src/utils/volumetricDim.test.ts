import { describe, expect, it } from "vitest";
import {
  applyQrOneDecimalRule,
  applyScscLineDimRounding,
  applyScscTotalDimRounding,
  resolveScscAirlineDimRule,
  scscChargeableKindFromShipment,
} from "./scscChargeableWeight";
import {
  dimDivisorFromFlight,
  dimRoundingPolicyFromFlight,
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  formatShipmentDimWeightKg,
  lineDimKg,
  parseDimLineQuadsFromNumbersStrict,
  totalDimKgFromLines,
  truncatePositiveKg,
  tryParseDimPieceLinesFromComboText,
} from "./volumetricDim";

describe("parseDimLineQuadsFromNumbersStrict", () => {
  it("từ chối khi còn số thừa", () => {
    expect(parseDimLineQuadsFromNumbersStrict([40, 50, 30, 4, 5])).toBeNull();
  });
});

describe("tryParseDimPieceLinesFromComboText", () => {
  it("một dòng × như cũ", () => {
    const r = tryParseDimPieceLinesFromComboText("120×50×30×4");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toEqual([{ lCm: 120, wCm: 50, hCm: 30, pcs: 4 }]);
    }
  });

  it("khoảng trắng thay ×", () => {
    const r = tryParseDimPieceLinesFromComboText("40 50 30 10");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toEqual([{ lCm: 40, wCm: 50, hCm: 30, pcs: 10 }]);
  });

  it("x/X và dấu gạch", () => {
    const r = tryParseDimPieceLinesFromComboText("40x50x30x10");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines[0]).toEqual({ lCm: 40, wCm: 50, hCm: 30, pcs: 10 });
    const r2 = tryParseDimPieceLinesFromComboText("40-50-30-10");
    expect(r2.ok).toBe(true);
  });

  it("nhiều nhóm trên một dòng", () => {
    const r = tryParseDimPieceLinesFromComboText("40 50 30 10 55 45 35 5");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toHaveLength(2);
  });

  it("làm tròn cạnh thành số nguyên", () => {
    const r = tryParseDimPieceLinesFromComboText("40.6×50.2×30.1×2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines[0]!.lCm).toBe(41);
      expect(r.lines[0]!.wCm).toBe(50);
      expect(r.lines[0]!.hCm).toBe(30);
    }
  });
});

describe("dimDivisorFromFlight", () => {
  it("mặc định 6000", () => {
    expect(dimDivisorFromFlight("VN601")).toBe(6000);
    expect(dimDivisorFromFlight("VJ123")).toBe(6000);
  });
});

describe("SCSC Required airline — resolve", () => {
  it("VJ → truncate 3dp / tổng 0.5", () => {
    expect(dimRoundingPolicyFromFlight("VJ123")).toBe("DP3_ROUND_0_5");
    expect(resolveScscAirlineDimRule("VJ081")?.lineRound).toBe("TRUNCATE_3DP");
  });

  it("SQ / TR → tổng làm tròn 1", () => {
    expect(dimRoundingPolicyFromFlight("SQ177")).toBe("DP3_ROUND_1");
    expect(dimRoundingPolicyFromFlight("TR305")).toBe("DP3_ROUND_1");
    expect(resolveScscAirlineDimRule("SQ177")?.codes).toEqual(["SQ"]);
    expect(resolveScscAirlineDimRule("TR305")?.codes).toEqual(["TR"]);
    expect(scscChargeableKindFromShipment("", "618-1234 5678")).toBe("DP3_ROUND_1");
  });

  it("CX/LD → cắt 2dp / tổng 0.5", () => {
    expect(dimRoundingPolicyFromFlight("CX766")).toBe("DP2_ROUND_0_5");
    expect(resolveScscAirlineDimRule("LD562")?.lineRound).toBe("TRUNCATE_2DP");
  });

  it("TG / 6E → làm tròn số", () => {
    expect(dimRoundingPolicyFromFlight("TG610")).toBe("ROUND_INTEGER");
    expect(dimRoundingPolicyFromFlight("6E123")).toBe("ROUND_INTEGER");
  });

  it("QR → QR line + total", () => {
    expect(dimRoundingPolicyFromFlight("QR846")).toBe("QR_SPECIAL");
  });

  it("hãng lạ → STANDARD_IATA_2DP", () => {
    expect(dimRoundingPolicyFromFlight("VN601")).toBe("STANDARD_IATA_2DP");
  });
});

describe("DIM VJ — dòng cắt 3 số lẻ, tổng làm tròn 0.5", () => {
  const div = 6000 as const;
  const ctx = { flight: "VJ081", awb: "978-1111 2222" };
  const line = { lCm: 77, wCm: 58, hCm: 42, pcs: 3 };

  it("dòng ≠ làm tròn 0.5 trực tiếp trên raw", () => {
    const raw = ((77 * 58 * 42) / div) * 3;
    const vj = lineDimKg(line, div, ctx);
    const oldRound = applyScscLineDimRounding(raw, "TRUNCATE_3DP");
    expect(vj).toBe(oldRound);
    expect(vj).toBe(truncatePositiveKg(raw, 3));
  });

  it("tổng = làm tròn 0.5 sau cộng dòng", () => {
    const lines = [
      { lCm: 77, wCm: 58, hCm: 42, pcs: 3 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
    ];
    const a = lineDimKg(lines[0], div, ctx)!;
    const b = lineDimKg(lines[1], div, ctx)!;
    const tot = totalDimKgFromLines(lines, div, ctx)!;
    expect(tot).toBe(applyScscTotalDimRounding(a + b, "ROUND_0_5"));
  });
});

describe("formatDimKgDisplay", () => {
  it("VJ dòng: 3 số lẻ", () => {
    expect(formatLineDimKgDisplay(20.555, ctx())).toBe("20.555");
  });

  it("VJ tổng: 1 số lẻ", () => {
    expect(formatDimKgDisplay(100.5, ctx())).toBe("100.5");
    expect(formatShipmentDimWeightKg("VJ081", 100.5)).toBe("100.5");
  });

  it("IATA: 2 số lẻ", () => {
    expect(formatShipmentDimWeightKg("VN601", 139.205)).toBe("139.21");
  });
});

function ctx() {
  return { flight: "VJ081", awb: "978-1111 2222" };
}

describe("applyQrOneDecimalRule", () => {
  it("QR one-decimal rule", () => {
    expect(applyQrOneDecimalRule(10.0)).toBe(10);
    expect(applyQrOneDecimalRule(10.14)).toBe(10.5);
    expect(applyQrOneDecimalRule(10.49)).toBe(10.5);
    expect(applyQrOneDecimalRule(10.5)).toBe(11);
  });
});
