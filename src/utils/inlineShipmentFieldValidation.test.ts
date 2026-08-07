import { describe, expect, it } from "vitest";
import {
  normalizeInlineCneePrint,
  validateInlineCneePrint,
  validateInlineDimWeightKg,
  validateInlineKg,
  validateInlinePcs,
} from "./inlineShipmentFieldValidation";

describe("inlineShipmentFieldValidation", () => {
  it("pcs: số nguyên không âm", () => {
    expect(validateInlinePcs(null)).toBeNull();
    expect(validateInlinePcs(3)).toBeNull();
    expect(validateInlinePcs(-1)).toMatch(/âm/);
    expect(validateInlinePcs(1.5)).toMatch(/nguyên/);
  });

  it("kg / dimWeightKg: không âm", () => {
    expect(validateInlineKg(12.5)).toBeNull();
    expect(validateInlineKg(-0.1)).toMatch(/âm/);
    expect(validateInlineDimWeightKg(0)).toBeNull();
    expect(validateInlineDimWeightKg(-2)).toMatch(/âm/);
  });

  it("cneePrint: giới hạn độ dài", () => {
    expect(validateInlineCneePrint("ACME")).toBeNull();
    expect(validateInlineCneePrint("x".repeat(201))).toMatch(/tối đa/);
    expect(normalizeInlineCneePrint("  Hello  ")).toBe("Hello");
  });
});
