import { describe, expect, it } from "vitest";
import { fitAwbFontMm } from "./fitAwbFontMm";

describe("fitAwbFontMm", () => {
  it("AWB chuẩn 13 ký tự vừa ≤ 12.5mm và không quá nhỏ", () => {
    const mm = fitAwbFontMm("738-0725 2862");
    expect(mm).toBeGreaterThanOrEqual(9);
    expect(mm).toBeLessThanOrEqual(12.5);
  });

  it("AWB dài hơn thì cỡ chữ nhỏ hơn", () => {
    const short = fitAwbFontMm("160-1241 6666");
    const long = fitAwbFontMm("160-1241 6666-EXTRA");
    expect(long).toBeLessThan(short);
  });

  it("compact nhỏ hơn standard", () => {
    expect(fitAwbFontMm("738-0705 3690", { compact: true })).toBeLessThan(
      fitAwbFontMm("738-0705 3690")
    );
  });
});
