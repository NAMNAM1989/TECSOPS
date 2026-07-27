import { describe, expect, it } from "vitest";
import { formatAwb, formatAwbLabel } from "./awbFormat";
import { fitAwbFontMm } from "./fitAwbFontMm";

describe("fitAwbFontMm", () => {
  it("AWB tem vừa mức mẫu mới ≤ 10.05mm (~28.5pt)", () => {
    const mm = fitAwbFontMm("738-07053690");
    expect(mm).toBeGreaterThanOrEqual(7);
    expect(mm).toBeLessThanOrEqual(10.05);
  });

  it("AWB 12 ký tự tem → chạm max ~10.05mm", () => {
    const mm = fitAwbFontMm("695-56301136");
    expect(mm).toBeGreaterThanOrEqual(9);
    expect(mm).toBeLessThanOrEqual(10.05);
  });

  it("chuỗi ngắn hơn (bỏ khoảng) → chữ to hơn chuỗi có khoảng", () => {
    const withSpace = fitAwbFontMm("695-5630 1136");
    const noSpace = fitAwbFontMm("695-56301136");
    expect(noSpace).toBeGreaterThanOrEqual(withSpace);
  });

  it("AWB dài hơn thì cỡ chữ nhỏ hơn hoặc bằng (min clamp)", () => {
    const short = fitAwbFontMm("160-12416666");
    const long = fitAwbFontMm("160-12416666-EXTRA");
    expect(long).toBeLessThanOrEqual(short);
  });

  it("compact nhỏ hơn standard", () => {
    expect(fitAwbFontMm("738-07053690", { compact: true })).toBeLessThan(
      fitAwbFontMm("738-07053690"),
    );
  });
});

describe("formatAwbLabel", () => {
  it("bỏ khoảng giữa 4+4: 695-56301136", () => {
    expect(formatAwbLabel("69556301136")).toBe("695-56301136");
    expect(formatAwb("69556301136")).toBe("695-5630 1136");
  });
});
