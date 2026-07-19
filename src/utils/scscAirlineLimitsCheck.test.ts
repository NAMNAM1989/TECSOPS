import { describe, expect, it } from "vitest";
import {
  collectScscDimLimitWarnings,
  lineExceedsMaxDims,
} from "./scscAirlineLimitsCheck";

describe("lineExceedsMaxDims", () => {
  it("so khớp sau khi xoay cạnh", () => {
    expect(lineExceedsMaxDims({ lCm: 100, wCm: 140, hCm: 100, pcs: 1 }, { l: 140, w: 100, h: 100 })).toBe(
      false
    );
    expect(lineExceedsMaxDims({ lCm: 141, wCm: 100, hCm: 100, pcs: 1 }, { l: 140, w: 100, h: 100 })).toBe(
      true
    );
  });
});

describe("collectScscDimLimitWarnings", () => {
  it("VJ vượt dims → cảnh báo", () => {
    const w = collectScscDimLimitWarnings("VJ081", "978-1111 2222", [
      { lCm: 200, wCm: 100, hCm: 100, pcs: 1 },
    ]);
    expect(w.some((x) => x.kind === "dims")).toBe(true);
  });

  it("SQ/TR cùng AWB — TR dims; SQ không max dims", () => {
    const tr = collectScscDimLimitWarnings("TR305", "618-1111 2222", [
      { lCm: 160, wCm: 130, hCm: 110, pcs: 1 },
    ]);
    expect(tr.some((x) => x.kind === "dims")).toBe(true);

    const sq = collectScscDimLimitWarnings("SQ177", "618-1111 2222", [
      { lCm: 160, wCm: 130, hCm: 110, pcs: 1 },
    ]);
    expect(sq.some((x) => x.kind === "dims")).toBe(false);
    expect(sq.some((x) => x.kind === "note")).toBe(true);
  });
});
