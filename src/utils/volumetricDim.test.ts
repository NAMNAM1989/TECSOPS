import { describe, expect, it } from "vitest";
import {
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

describe("dimRoundingPolicyFromFlight", () => {
  it("nhận VJ từ mã chuyến", () => {
    expect(dimRoundingPolicyFromFlight("VJ123")).toBe("VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND");
    expect(dimRoundingPolicyFromFlight("vj 999")).toBe("VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND");
  });

  it("mặc định chuẩn IATA cho hãng khác", () => {
    expect(dimRoundingPolicyFromFlight("VN601")).toBe("STANDARD_IATA_2DP");
    expect(dimRoundingPolicyFromFlight("")).toBe("STANDARD_IATA_2DP");
  });
});

describe("DIM theo chính sách VJ (cắt 3 số lẻ / dòng, tổng không làm tròn)", () => {
  const div = 6000 as const;
  /** Kích thước sao cho (D×R×C)/6000 có nhiều chữ thập phân */
  const line = { lCm: 77, wCm: 58, hCm: 42, pcs: 3 };

  it("VJ: dòng cắt 3 chữ thập phân, khác làm tròn 2 số lẻ chuẩn", () => {
    const rawUnit = (77 * 58 * 42) / div;
    expect(rawUnit * 3).toBeGreaterThan(93.546);

    const vj = lineDimKg(line, div, "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND");
    const std = lineDimKg(line, div, "STANDARD_IATA_2DP");
    expect(vj).not.toBe(std);
    expect(vj).toBe(Math.floor(rawUnit * 3 * 1000 + 1e-9) / 1000);
  });

  it("VJ: tổng cắt 3 số lẻ sau khi cộng (khớp truncate của tổng)", () => {
    const lines = [
      { lCm: 77, wCm: 58, hCm: 42, pcs: 3 },
      { lCm: 40, wCm: 50, hCm: 30, pcs: 1 },
    ];
    const a = lineDimKg(lines[0], div, "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND")!;
    const b = lineDimKg(lines[1], div, "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND")!;
    const tot = totalDimKgFromLines(lines, div, "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND")!;
    expect(tot).toBe(Math.floor((a + b) * 1000 + 1e-9) / 1000);
  });
});

describe("formatDimKgDisplay / formatShipmentDimWeightKg", () => {
  it("VJ: bỏ nhiễu float, luôn 3 số lẻ", () => {
    expect(formatDimKgDisplay(1392.1080000000002, "VJ_TRUNC3_LINE_SUM_NO_TOTAL_ROUND")).toBe("1392.108");
  });

  it("formatShipmentDimWeightKg theo chuyến", () => {
    expect(formatShipmentDimWeightKg("VJ081", 1392.1080000000002)).toBe("1392.108");
    expect(formatShipmentDimWeightKg("VN601", 139.205)).toBe("139.21");
  });
});
