import { describe, expect, it } from "vitest";
import { layoutScscOtherRequirements } from "./scscOtherRequirementsFontFit";

describe("layoutScscOtherRequirements", () => {
  it("chuỗi ngắn dùng tối đa 3mm", () => {
    const r = layoutScscOtherRequirements("HANDLE WITH CARE");
    expect(r.fontMm).toBe(3);
    expect(r.multiline).toBe(false);
  });

  it("chuỗi dài xuống dòng trong vùng 10mm", () => {
    const long =
      "DO NOT STACK FRAGILE KEEP DRY TEMPERATURE CONTROL REQUIRED SPECIAL DOCUMENTS ATTACHED";
    const r = layoutScscOtherRequirements(long);
    expect(r.fontMm).toBeLessThanOrEqual(3);
    expect(r.heightMm).toBeLessThanOrEqual(10);
    if (r.multiline) expect(r.displayText.split("\n").length).toBeGreaterThan(1);
  });
});
