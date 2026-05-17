import { describe, expect, it } from "vitest";
import { layoutScscGoods, scscGoodsBoxWidthMm, wrapGoodsLines } from "./scscGoodsFontFit";

describe("layoutScscGoods", () => {
  const w = scscGoodsBoxWidthMm();

  it("chuỗi ngắn dùng 4mm một dòng", () => {
    const r = layoutScscGoods("GEN", w);
    expect(r.fontMm).toBe(4);
    expect(r.multiline).toBe(false);
    expect(r.displayText).toBe("GEN");
  });

  it("chuỗi vừa thu cỡ chữ trước khi xuống dòng", () => {
    const r = layoutScscGoods("ELECTRONIC COMPONENTS AND ACCESSORIES", w);
    expect(r.fontMm).toBeLessThan(4);
    expect(r.fontMm).toBeGreaterThanOrEqual(2);
  });

  it("chuỗi rất dài: 2mm và nhiều dòng", () => {
    const long =
      "ELECTRONIC COMPONENTS AND ACCESSORIES FOR EXPORT ONLY SPECIAL HANDLING REQUIRED";
    const r = layoutScscGoods(long, w);
    expect(r.fontMm).toBe(2);
    expect(r.multiline).toBe(true);
    expect(r.displayText.split("\n").length).toBeGreaterThan(1);
  });
});

describe("wrapGoodsLines", () => {
  it("ngắt theo từ", () => {
    const lines = wrapGoodsLines("AAA BBB CCC", 20, 4);
    expect(lines.length).toBeGreaterThan(1);
  });
});
