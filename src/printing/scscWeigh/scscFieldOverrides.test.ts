import { describe, expect, it } from "vitest";
import type { ScscFieldDef } from "./scscWeighTemplate";
import {
  applyScscFieldOverride,
  applyScscFieldOverrides,
  mergeScscFieldOverrides,
  mergeScscFieldUserPatch,
  normalizeScscFieldOverridesMapLoose,
  pruneEmptyScscFieldOverrides,
  removeScscFieldOverride,
} from "./scscFieldOverrides";
import { enrichScscPrintForRender } from "./scscWeighLayout";

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

  it("snapshot layout khi user patch — giữ font/cao ô đang thấy", () => {
    const def: ScscFieldDef = {
      key: "goods",
      x: 35,
      y: 160,
      width: 75,
      fontMm: 2.5,
      lineHeightMm: 2.9,
      heightMm: 5.8,
      multiline: true,
    };
    const merged = mergeScscFieldUserPatch(def, undefined, "goods", { y: 162 });
    expect(merged?.goods).toMatchObject({
      x: 35,
      y: 162,
      width: 75,
      fontMm: 2.5,
      lineHeightMm: 3,
      heightMm: 6,
      multiline: true,
    });
  });

  it("enrich bỏ qua ô đã khóa layout (font/cao dòng)", () => {
    const fields = [baseField()];
    const values = { goods: "VERY LONG TEXT THAT WOULD SHRINK FONT AUTOMATICALLY" };
    const auto = enrichScscPrintForRender(fields, values, undefined);
    expect(auto.fields[0].fontMm).toBeLessThan(4);
    const locked = enrichScscPrintForRender(fields, values, {
      goods: { fontMm: 4, multiline: false },
    });
    expect(locked.fields[0].fontMm).toBe(4);
  });
});
