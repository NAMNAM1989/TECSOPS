import { describe, expect, it } from "vitest";
import type { ScscFieldDef } from "./scscWeighTemplate";
import {
  applyScscFieldOverride,
  applyScscFieldOverrides,
  mergeScscFieldOverrides,
  normalizeScscFieldOverridesMapLoose,
  pruneEmptyScscFieldOverrides,
  removeScscFieldOverride,
} from "./scscFieldOverrides";

const baseField = (): ScscFieldDef => ({
  key: "goods",
  x: 35,
  y: 160,
  width: 75,
  fontMm: 4,
});

describe("scscFieldOverrides", () => {
  it("áp dụng ghi đè lên field", () => {
    const out = applyScscFieldOverrides([baseField()], { goods: { x: 40, y: 165 } });
    expect(out[0]).toMatchObject({ x: 40, y: 165, width: 75 });
  });

  it("merge và xoá một ô", () => {
    const merged = mergeScscFieldOverrides({ goods: { x: 40 } }, { goods: { y: 170 } });
    expect(merged?.goods).toEqual({ x: 40, y: 170 });
    const cleared = removeScscFieldOverride(merged, "goods");
    expect(cleared).toBeUndefined();
  });

  it("fontPt ghi đè và xoá fontMm", () => {
    const def = baseField();
    const out = applyScscFieldOverride(def, { fontPt: 10 });
    expect(out.fontPt).toBe(10);
    expect(out.fontMm).toBeUndefined();
  });

  it("normalize giới hạn", () => {
    const m = normalizeScscFieldOverridesMapLoose({
      goods: { x: 999, y: -5, width: 10 },
    });
    expect(m?.goods?.x).toBe(205);
    expect(m?.goods?.y).toBe(0);
    expect(pruneEmptyScscFieldOverrides({})).toBeUndefined();
  });
});
