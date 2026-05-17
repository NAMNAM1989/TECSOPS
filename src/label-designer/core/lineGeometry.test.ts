import { describe, expect, it } from "vitest";
import { createLineObject } from "../designer/objectFactories";
import { lineLengthMm, setLineHorizontal, setLineLengthFromStart } from "./lineGeometry";

describe("lineGeometry", () => {
  it("setLineLengthFromStart", () => {
    const line = createLineObject(0, 0);
    const next = setLineLengthFromStart(line, 30);
    expect(lineLengthMm(next)).toBeCloseTo(30, 1);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it("setLineHorizontal", () => {
    const line = { ...createLineObject(5, 5), x2: 5, y2: 20 };
    const h = setLineHorizontal(line, 40);
    expect(h.y2).toBe(5);
    expect(h.x2 - h.x).toBeCloseTo(40, 1);
  });
});
