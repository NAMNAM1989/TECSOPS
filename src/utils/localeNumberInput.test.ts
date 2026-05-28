import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "./localeNumberInput";

describe("parseLocaleNumber", () => {
  it("0,98 → 0.98 (không thành 98)", () => {
    expect(parseLocaleNumber("0,98")).toBe(0.98);
    expect(parseLocaleNumber("0,5")).toBe(0.5);
  });

  it("0.98 en-US", () => {
    expect(parseLocaleNumber("0.98")).toBe(0.98);
  });

  it("số nguyên", () => {
    expect(parseLocaleNumber("1101")).toBe(1101);
    expect(parseLocaleNumber("181")).toBe(181);
  });

  it("1.234,56 vi-VN", () => {
    expect(parseLocaleNumber("1.234,56")).toBe(1234.56);
  });

  it("1101 × 0,98", () => {
    const qty = parseLocaleNumber("1101")!;
    const price = parseLocaleNumber("0,98")!;
    expect(Math.round(qty * price * 100) / 100).toBe(1078.98);
  });
});
