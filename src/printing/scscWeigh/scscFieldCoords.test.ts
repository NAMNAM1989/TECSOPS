import { describe, expect, it } from "vitest";
import {
  applyScscPrintTransformToBounds,
  formatScscFieldCoordSnippet,
  getScscFieldBoundsMm,
} from "./scscFieldCoords";
import type { ScscFieldDef } from "./scscWeighTemplate";

describe("scscFieldCoords", () => {
  it("tính bounds và snippet copy", () => {
    const def: ScscFieldDef = {
      key: "goods",
      x: 35,
      y: 160,
      width: 75,
      fontMm: 4,
      bold: true,
    };
    const b = getScscFieldBoundsMm(def, { goods: "ABC" });
    expect(b.hasValue).toBe(true);
    expect(formatScscFieldCoordSnippet(b)).toContain('key: "goods"');
    expect(formatScscFieldCoordSnippet(b)).toContain("x: 35");
  });

  it("transform profile áp lên tọa độ", () => {
    const eff = applyScscPrintTransformToBounds(
      { x: 10, y: 20, width: 30, height: 5 },
      { offsetXmm: 1, offsetYmm: -0.5, scaleX: 1.02, scaleY: 1 }
    );
    expect(eff.x).toBe(11.2);
    expect(eff.y).toBe(19.5);
    expect(eff.width).toBe(30.6);
  });
});
