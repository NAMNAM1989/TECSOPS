import { describe, expect, it } from "vitest";
import { clampPanelOffset } from "./useDraggablePanel";

describe("clampPanelOffset", () => {
  it("giữ offset trong viewport với margin", () => {
    const clamped = clampPanelOffset(
      { x: 5000, y: 5000 },
      {
        panelWidth: 400,
        panelHeight: 300,
        offset: { x: 0, y: 0 },
        rectLeft: 100,
        rectTop: 50,
        viewportW: 1000,
        viewportH: 800,
        marginPx: 24,
      },
    );
    expect(clamped.x).toBeLessThanOrEqual(1000 - 24 - 100);
    expect(clamped.y).toBeLessThanOrEqual(800 - 24 - 50);
  });
});
