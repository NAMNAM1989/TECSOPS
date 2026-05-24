import { describe, expect, it } from "vitest";
import { applyScscPrintTransformToBounds } from "./scscFieldCoords";
import { buildScscWeighOverlayValues, fieldStyle, resolveScscWeighPrintLayer } from "./scscWeighTemplate";
import { scscPrintLayerToPdfRenderFields } from "../../utils/printFieldConvert";
import { SAMPLE_SCSC_FORM_DATA } from "../../utils/scscWeighPdfPrint";
import { defaultScscWeighPrintSettings } from "./scscWeighPrintSettingsCore";
import type { A4WeighReceiptPrinterProfile } from "../printTypes";

/** Công thức PDF cũ (sai) — (x + offset) * scale. */
function legacyPdfPos(x: number, y: number, t: { offsetXmm: number; offsetYmm: number; scaleX: number; scaleY: number }) {
  return {
    x: (x + t.offsetXmm) * t.scaleX,
    y: (y + t.offsetYmm) * t.scaleY,
  };
}

/** Công thức khớp preview/CSS — offset + x * scale. */
function cssPreviewPos(x: number, y: number, t: { offsetXmm: number; offsetYmm: number; scaleX: number; scaleY: number }) {
  return applyScscPrintTransformToBounds({ x, y, width: 0, height: null }, t);
}

const baseProfile = (): A4WeighReceiptPrinterProfile => ({
  id: "test-a4",
  name: "Test",
  type: "a4-browser",
  paper: "A4",
  offsetXmm: 0,
  offsetYmm: 0,
  scaleX: 1,
  scaleY: 1,
  templateVersion: "1",
});

const profileWithCalib = (): A4WeighReceiptPrinterProfile => ({
  ...baseProfile(),
  offsetXmm: 1.5,
  offsetYmm: -0.5,
  scaleX: 1.03,
  scaleY: 1.02,
  scscFieldOverrides: {
    goods: { y: 161, width: 72 },
    senderName: { y: 258, align: "center" },
    pieces: { y: 170 },
  },
});

describe("scscPrintPreviewParity", () => {
  it("công thức PDF cũ khác CSS khi offset và scale cùng lệch", () => {
    const t = { offsetXmm: 3, offsetYmm: 2, scaleX: 1.08, scaleY: 1.05 };
    const x = 140;
    const y = 35;
    const legacy = legacyPdfPos(x, y, t);
    const css = cssPreviewPos(x, y, t);
    // legacy: (x+ox)*sx ; css: ox + x*sx → chênh ox*(sx-1)
    expect(legacy.x - css.x).toBeCloseTo(t.offsetXmm * (t.scaleX - 1), 4);
    expect(legacy.y - css.y).toBeCloseTo(t.offsetYmm * (t.scaleY - 1), 1);
  });

  it("renderFields giữ tọa độ gốc (chưa transform) — server phải áp CSS transform", () => {
    const profile = profileWithCalib();
    const values = buildScscWeighOverlayValues(SAMPLE_SCSC_FORM_DATA, defaultScscWeighPrintSettings(), "TECS-SCSC");
    const layer = resolveScscWeighPrintLayer(profile, values);
    const goods = layer.fields.find((f) => f.key === "goods");
    expect(goods).toBeDefined();
    const payloads = scscPrintLayerToPdfRenderFields(layer.fields);
    const goodsPayload = payloads.find((p) => p.fieldKey === "goods");
    expect(goodsPayload?.posYMm).toBe(161);
    expect(layer.values.goods).toContain("GENERAL");
  });

  it("enrich goods multiline khi text dài + ô hẹp (chưa căn chỉnh)", () => {
    const profile = baseProfile();
    profile.scscFieldOverrides = { goods: { width: 28 } };
    const longGoods = {
      ...SAMPLE_SCSC_FORM_DATA,
      goodsDescription: "ELECTRONIC COMPONENTS AND SPARE PARTS FOR INDUSTRIAL EQUIPMENT",
    };
    const values = buildScscWeighOverlayValues(longGoods, defaultScscWeighPrintSettings(), "TECS-SCSC");
    const layer = resolveScscWeighPrintLayer(profile, values);
    const goods = layer.fields.find((f) => f.key === "goods");
    expect(goods?.multiline).toBe(true);
    expect(goods?.heightMm).toBeGreaterThan(goods?.lineHeightMm ?? 0);
    expect(layer.values.goods).toContain("\n");
  });

  it("HTML fieldStyle dùng chung logic với preview (flex căn giữa)", () => {
    const css = fieldStyle({
      key: "senderName",
      x: 140,
      y: 257,
      width: 55,
      fontMm: 3,
      lineHeightMm: 6,
      align: "center",
    });
    expect(css).toContain("display:flex");
    expect(css).toContain("justify-content:center");
    expect(css).toContain("font-size:3mm");
  });

  it("font user override không bị enrich ghi đè", () => {
    const profile = profileWithCalib();
    profile.scscFieldOverrides = {
      goods: { x: 35, y: 161, width: 70, fontMm: 3.5, lineHeightMm: 4, heightMm: 4, multiline: false },
    };
    const values = buildScscWeighOverlayValues(
      { ...SAMPLE_SCSC_FORM_DATA, goodsDescription: "EXTREMELY LONG GOODS DESCRIPTION FOR TEST" },
      defaultScscWeighPrintSettings(),
      "TECS-SCSC"
    );
    const layer = resolveScscWeighPrintLayer(profile, values);
    const goods = layer.fields.find((f) => f.key === "goods");
    expect(goods?.fontMm).toBe(3.5);
  });
});
