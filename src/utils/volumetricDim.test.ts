import { describe, expect, it } from "vitest";
import {
  parseDimLineQuadsFromNumbersStrict,
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
