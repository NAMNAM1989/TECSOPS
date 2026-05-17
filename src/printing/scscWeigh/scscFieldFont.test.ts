import { describe, expect, it } from "vitest";
import { nudgeScscFieldFontPatch, readScscFieldFont } from "./scscFieldFont";
import type { ScscFieldDef } from "./scscWeighTemplate";

describe("scscFieldFont", () => {
  it("đọc mm hoặc pt", () => {
    expect(readScscFieldFont({ key: "a", x: 0, y: 0, width: 1, fontMm: 3 })).toEqual({
      unit: "mm",
      value: 3,
    });
    expect(readScscFieldFont({ key: "b", x: 0, y: 0, width: 1, fontPt: 9.5 })).toEqual({
      unit: "pt",
      value: 9.5,
    });
  });

  it("nudge cỡ chữ", () => {
    const def: ScscFieldDef = { key: "g", x: 0, y: 0, width: 10, fontMm: 3 };
    expect(nudgeScscFieldFontPatch(def, 1)).toEqual({ fontMm: 3.5 });
  });
});
