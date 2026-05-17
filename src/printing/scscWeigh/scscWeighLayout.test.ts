import { describe, expect, it } from "vitest";
import {
  buildScscWeighPrintFields,
  enrichScscPrintForRender,
  formatScscHawbStatusLabel,
  resolveScscWeighLayout,
  suggestAddressFontForLineGap,
} from "./scscWeighLayout";
import { resolveScscWeighPrintLayer } from "./scscWeighTemplate";

describe("scscWeighLayout", () => {
  it("mặc định gap 6mm và cỡ địa chỉ 3mm", () => {
    const layout = resolveScscWeighLayout(null);
    expect(layout.partyLineGapMm).toBe(6);
    expect(layout.partyAddressFontMm).toBe(3);
    expect(suggestAddressFontForLineGap(6)).toBe(3);
  });

  it("địa chỉ dùng line-height bằng khoảng cách dòng", () => {
    const fields = buildScscWeighPrintFields(resolveScscWeighLayout(null));
    const addr1 = fields.find((f) => f.key === "shipperAddress1");
    expect(addr1?.lineHeightMm).toBe(6);
    expect(addr1?.fontMm).toBe(3);
  });

  it("tên CNEE 3mm, mép trái 50mm", () => {
    const fields = buildScscWeighPrintFields(resolveScscWeighLayout(null));
    const name = fields.find((f) => f.key === "consignee");
    expect(name?.x).toBe(50);
    expect(name?.fontMm).toBe(3);
  });

  it("đọc tuỳ chỉnh từ profile A4", () => {
    const layout = resolveScscWeighLayout({
      id: "x",
      name: "Test",
      type: "a4-browser",
      paper: "A4",
      offsetXmm: 0,
      offsetYmm: 0,
      scaleX: 1,
      scaleY: 1,
      templateVersion: "scsc-weigh-v1",
      partyLineGapMm: 7,
      partyAddressFontMm: 4,
    });
    expect(layout.partyLineGapMm).toBe(7);
    expect(layout.partyAddressFontMm).toBe(4);
    const addr2 = buildScscWeighPrintFields(layout).find((f) => f.key === "agentAddress2");
    expect(addr2?.y).toBe(70 + 7 * 2);
    expect(addr2?.lineHeightMm).toBe(7);
  });

  it("DEST / chuyến bay / HAWB / tên hàng theo tọa độ mới", () => {
    const fields = buildScscWeighPrintFields(resolveScscWeighLayout(null));
    expect(fields.find((f) => f.key === "destination")).toMatchObject({
      x: 170,
      y: 138,
      fontMm: 5,
      bold: true,
    });
    expect(fields.find((f) => f.key === "flightDate")).toMatchObject({
      x: 170,
      y: 144,
      fontMm: 4,
    });
    expect(fields.find((f) => f.key === "totalHawbs")).toMatchObject({
      x: 60,
      y: 145,
      fontMm: 6,
    });
    expect(fields.find((f) => f.key === "goods")).toMatchObject({
      x: 35,
      y: 160,
      width: 75,
    });
  });

  it("co giãn / xuống dòng tên hàng", () => {
    const base = buildScscWeighPrintFields(resolveScscWeighLayout(null));
    const short = enrichScscPrintForRender(base, { goods: "GEN" });
    const long = enrichScscPrintForRender(base, {
      goods: "ELECTRONIC COMPONENTS AND ACCESSORIES FOR EXPORT ONLY SPECIAL",
    });
    expect(short.fields.find((f) => f.key === "goods")?.fontMm).toBe(4);
    expect(short.fields.find((f) => f.key === "goods")?.multiline).toBe(false);
    const goodsLong = long.fields.find((f) => f.key === "goods");
    expect(goodsLong?.fontMm).toBeLessThanOrEqual(4);
    if (goodsLong?.multiline) {
      expect(long.values.goods.split("\n").length).toBeGreaterThan(1);
    }
  });

  it("nhãn HAWB chỉ NO HAWB hoặc 01 HAWB", () => {
    expect(formatScscHawbStatusLabel("")).toBe("NO HAWB");
    expect(formatScscHawbStatusLabel("  ABC  ")).toBe("01 HAWB");
  });

  it("profile scscFieldOverrides dịch ô khi in", () => {
    const layer = resolveScscWeighPrintLayer(
      {
        id: "t",
        name: "T",
        type: "a4-browser",
        paper: "A4",
        offsetXmm: 0,
        offsetYmm: 0,
        scaleX: 1,
        scaleY: 1,
        templateVersion: "scsc-weigh-v1",
        scscFieldOverrides: { goods: { x: 36, y: 161 } },
      },
      { goods: "GEN" }
    );
    expect(layer.fields.find((f) => f.key === "goods")).toMatchObject({ x: 36, y: 161 });
  });

  it("yêu cầu khác — tọa độ và co giãn chữ", () => {
    const fields = buildScscWeighPrintFields(resolveScscWeighLayout(null));
    expect(fields.find((f) => f.key === "otherRequirements")).toMatchObject({
      x: 45,
      y: 270,
      width: 80,
      fontMm: 3,
      heightMm: 10,
    });
    const fit = enrichScscPrintForRender(fields, {
      otherRequirements: "KHÔNG XẾP CHỒNG — GIỮ KHÔ",
    });
    const def = fit.fields.find((f) => f.key === "otherRequirements");
    expect(def?.fontMm).toBeGreaterThanOrEqual(2);
    expect(def?.fontMm).toBeLessThanOrEqual(3);
    expect(fit.values.otherRequirements.length).toBeGreaterThan(0);
  });
});
