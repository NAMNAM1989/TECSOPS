import { describe, expect, it } from "vitest";
import { mmToPt, mmToPx, pxToMm, ptToMm } from "./printMmUnits";

describe("printMmUnits", () => {
  it("mm ↔ pt khớp PDF (72pt/inch)", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 4);
    expect(ptToMm(72)).toBeCloseTo(25.4, 4);
  });

  it("px ↔ mm theo canvas A4", () => {
    const canvasW = 840;
    expect(pxToMm(420, canvasW)).toBeCloseTo(105, 2);
    expect(mmToPx(105, canvasW)).toBeCloseTo(420, 2);
  });
});
