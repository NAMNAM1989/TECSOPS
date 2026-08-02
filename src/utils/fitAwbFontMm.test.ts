import { describe, expect, it } from "vitest";
import { formatAwb, formatAwbLabel } from "./awbFormat";
import { fitAwbFontMm, fitRouteCodeFontMm } from "./fitAwbFontMm";

describe("fitAwbFontMm", () => {
  it("AWB tem to hơn mẫu cũ, vẫn ≤ 12.2mm (~34.5pt)", () => {
    const mm = fitAwbFontMm("738-07053690");
    expect(mm).toBeGreaterThanOrEqual(8.2);
    expect(mm).toBeLessThanOrEqual(12.2);
  });

  it("AWB 12 ký tự tem → chạm gần max ~12.2mm", () => {
    const mm = fitAwbFontMm("695-56301136");
    expect(mm).toBeGreaterThanOrEqual(10);
    expect(mm).toBeLessThanOrEqual(12.2);
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

describe("fitRouteCodeFontMm", () => {
  it("DEST 3 ký tự → gần max standard 8.2mm", () => {
    const mm = fitRouteCodeFontMm("SIN");
    expect(mm).toBeGreaterThanOrEqual(7);
    expect(mm).toBeLessThanOrEqual(8.2);
  });

  it("compact nhỏ hơn standard", () => {
    expect(fitRouteCodeFontMm("BKK", { compact: true })).toBeLessThan(
      fitRouteCodeFontMm("BKK"),
    );
  });

  it("mã dài hơn → chữ nhỏ hơn hoặc bằng", () => {
    const short = fitRouteCodeFontMm("SIN");
    const long = fitRouteCodeFontMm("SINAPORE");
    expect(long).toBeLessThanOrEqual(short);
  });
});

describe("formatAwbLabel", () => {
  it("bỏ khoảng giữa 4+4: 695-56301136", () => {
    expect(formatAwbLabel("69556301136")).toBe("695-56301136");
    expect(formatAwb("69556301136")).toBe("695-5630 1136");
  });
});
