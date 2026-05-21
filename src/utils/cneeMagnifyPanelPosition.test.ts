import { describe, expect, it } from "vitest";
import { computeCneeMagnifyPanelPos } from "./cneeMagnifyPanelPosition";

function rect(
  top: number,
  left: number,
  width: number,
  height: number
): DOMRect {
  return {
    top,
    left,
    bottom: top + height,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("computeCneeMagnifyPanelPos", () => {
  const vh = 900;
  const vw = 1200;

  it("mở ngay dưới ô (middle row)", () => {
    const pos = computeCneeMagnifyPanelPos(rect(200, 100, 120, 24), { vw, vh });
    expect(pos.placement).toBe("below");
    expect(pos.top).toBe(200 + 24 + 4);
    expect(pos.maxHeight).toBeGreaterThan(200);
  });

  it("cuối bảng: không nhảy lên xa — neo dưới ô và thu maxHeight", () => {
    const anchor = rect(860, 80, 140, 22);
    const pos = computeCneeMagnifyPanelPos(anchor, { vw, vh });
    expect(pos.placement).toBe("below");
    expect(pos.top).toBe(anchor.bottom + 4);
    expect(pos.top).toBeGreaterThan(850);
    expect(pos.maxHeight).toBeLessThanOrEqual(vh - 8 - pos.top);
    expect(pos.top + pos.maxHeight).toBeLessThanOrEqual(vh - 8 + 0.01);
  });

  it("không dùng công thức bottom - maxHeight (bug cũ)", () => {
    const anchor = rect(860, 80, 140, 22);
    const pos = computeCneeMagnifyPanelPos(anchor, { vw, vh });
    const buggyTop = anchor.bottom - 460;
    expect(pos.top).not.toBeCloseTo(buggyTop, 0);
    expect(pos.top).toBeGreaterThan(800);
  });
});
