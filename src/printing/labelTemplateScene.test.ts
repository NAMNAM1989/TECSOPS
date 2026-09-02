import { describe, expect, it } from "vitest";
import {
  defaultMasterLabelScene,
  emptyLabelScene,
  validateLabelScene,
} from "./labelTemplateScene";

describe("labelTemplateScene", () => {
  it("canvas khớp khổ 100×80 / 100×50", () => {
    expect(emptyLabelScene("100x80").canvasHeightMm).toBe(80);
    expect(emptyLabelScene("100x50").canvasHeightMm).toBe(50);
  });

  it("default master scene publish được khi require mandatory fields", () => {
    for (const format of ["100x80", "100x50"] as const) {
      const scene = defaultMasterLabelScene(format);
      const res = validateLabelScene(scene, {
        kind: "master-cargo",
        requireMandatoryFields: true,
      });
      expect(res.ok, res.errors.join("; ")).toBe(true);
    }
  });

  it("reject element vượt canvas và thiếu field bắt buộc", () => {
    const scene = emptyLabelScene("100x80");
    scene.elements.push({
      id: "overflow",
      type: "static-text",
      text: "x",
      xMm: 90,
      yMm: 70,
      widthMm: 20,
      heightMm: 20,
      rotation: 0,
      zIndex: 1,
      locked: false,
      visible: true,
      style: {},
    });
    const clip = validateLabelScene(scene);
    expect(clip.ok).toBe(false);
    expect(clip.errors.some((e) => /vượt canvas/i.test(e))).toBe(true);

    const empty = validateLabelScene(emptyLabelScene("100x80"), {
      kind: "master-cargo",
      requireMandatoryFields: true,
    });
    expect(empty.ok).toBe(false);
    expect(empty.errors.some((e) => /shipment\.mawb/i.test(e))).toBe(true);
  });
});
