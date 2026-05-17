import { layoutScscFitText, type ScscFitTextLayoutResult } from "./scscFitTextLayout";

/** Ô “Yêu cầu khác” — mép trên 270mm, mép trái 45mm, cao ~10mm (270–280). */
export const SCSC_OTHER_REQ_BOX = {
  leftMm: 45,
  topMm: 270,
  bottomMm: 280,
  rightMm: 125,
  minFontMm: 2,
  maxFontMm: 3,
  charWidthFactor: 0.52,
  lineHeightFactor: 1.12,
} as const;

const FIT_CFG = {
  minFontMm: SCSC_OTHER_REQ_BOX.minFontMm,
  maxFontMm: SCSC_OTHER_REQ_BOX.maxFontMm,
  maxHeightMm: SCSC_OTHER_REQ_BOX.bottomMm - SCSC_OTHER_REQ_BOX.topMm,
  charWidthFactor: SCSC_OTHER_REQ_BOX.charWidthFactor,
  lineHeightFactor: SCSC_OTHER_REQ_BOX.lineHeightFactor,
};

export function scscOtherReqBoxWidthMm(): number {
  return SCSC_OTHER_REQ_BOX.rightMm - SCSC_OTHER_REQ_BOX.leftMm;
}

export function layoutScscOtherRequirements(
  text: string,
  widthMm: number = scscOtherReqBoxWidthMm()
): ScscFitTextLayoutResult {
  return layoutScscFitText(text, widthMm, FIT_CFG);
}
