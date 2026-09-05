import { describe, expect, it } from "vitest";
import {
  clampSplitPrimary,
  primaryFromPointer,
  splitPersistKey,
} from "./useSplitPane";

describe("useSplitPane helpers", () => {
  it("splitPersistKey", () => {
    expect(splitPersistKey("h21_invoice")).toBe("tecsops_split:h21_invoice:v1");
    expect(splitPersistKey("dim_inner", "v2")).toBe("tecsops_split:dim_inner:v2");
  });

  it("clampSplitPrimary percent", () => {
    expect(
      clampSplitPrimary(10, { min: 30, max: 70, unit: "percent" })
    ).toBe(30);
    expect(
      clampSplitPrimary(90, { min: 30, max: 70, unit: "percent" })
    ).toBe(70);
    expect(
      clampSplitPrimary(54, { min: 30, max: 70, unit: "percent" })
    ).toBe(54);
  });

  it("clampSplitPrimary respects minSecondaryPx", () => {
    // container 1000px, secondary ≥ 400 → primary max 60%
    expect(
      clampSplitPrimary(80, {
        min: 20,
        max: 80,
        unit: "percent",
        containerSize: 1000,
        minSecondaryPx: 400,
      })
    ).toBe(60);
  });

  it("clampSplitPrimary px + minSecondary", () => {
    expect(
      clampSplitPrimary(900, {
        min: 200,
        max: 800,
        unit: "px",
        containerSize: 1000,
        minSecondaryPx: 300,
      })
    ).toBe(700);
  });

  it("primaryFromPointer percent", () => {
    expect(primaryFromPointer(500, 0, 1000, "percent")).toBe(50);
    expect(primaryFromPointer(270, 100, 800, "percent")).toBe(21.25);
  });

  it("primaryFromPointer px", () => {
    expect(primaryFromPointer(450, 100, 800, "px")).toBe(350);
  });
});
