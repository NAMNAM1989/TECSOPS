import { layoutScscFitText, type ScscFitTextBoxConfig } from "./scscFitTextLayout";

const SENDER_NAME_CFG: ScscFitTextBoxConfig = {
  minFontMm: 2.5,
  maxFontMm: 3,
  maxHeightMm: 12,
  charWidthFactor: 0.55,
  lineHeightFactor: 2,
};

const SENDER_PHONE_CFG: ScscFitTextBoxConfig = {
  minFontMm: 2.5,
  maxFontMm: 3,
  maxHeightMm: 6,
  charWidthFactor: 0.55,
  lineHeightFactor: 2,
};

export function layoutScscSenderName(text: string, widthMm: number) {
  return layoutScscFitText(text, widthMm, SENDER_NAME_CFG);
}

export function layoutScscSenderPhone(text: string, widthMm: number) {
  return layoutScscFitText(text, widthMm, SENDER_PHONE_CFG);
}
