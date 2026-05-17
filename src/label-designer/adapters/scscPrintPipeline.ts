import type { A4WeighReceiptPrinterProfile } from "../../printing/printTypes";
import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";
import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import { buildScscWeighOverlayValues } from "../../printing/scscWeigh/scscWeighTemplate";
import { getBuiltinTemplate } from "../core/defaultTemplates";
import type { LabelTemplateV1 } from "../core/types";
import { buildScscLabelContextFromOverlay } from "../data/scscDataContext";
import { renderLabelTemplateToHtml } from "../render/renderTemplateHtml";

export function usesScscLabelTemplate(profile: A4WeighReceiptPrinterProfile): boolean {
  return Boolean(profile.labelTemplate && profile.labelTemplate.objects.length > 0);
}

export function resolveScscLabelTemplate(profile: A4WeighReceiptPrinterProfile): LabelTemplateV1 {
  if (profile.labelTemplate?.version === 1 && profile.labelTemplate.objects.length > 0) {
    return structuredClone(profile.labelTemplate);
  }
  return getBuiltinTemplate("scsc-weigh-a4");
}

export function buildScscFieldHtmlFromTemplate(
  formData: ScaleTicketFormData,
  profile: A4WeighReceiptPrinterProfile,
  shared: ScscWeighPrintSettings,
  transformCss?: string
): string {
  const overlay = buildScscWeighOverlayValues(formData, shared);
  const ctx = buildScscLabelContextFromOverlay(overlay);
  const template = resolveScscLabelTemplate(profile);
  const wrapperStyle = transformCss
    ? `position:absolute;left:0;top:0;width:${template.page.width}mm;height:${template.page.height}mm;transform:${transformCss};transform-origin:top left;`
    : undefined;
  return renderLabelTemplateToHtml(template, ctx, {
    wrapperStyle,
    sheetClassName: "scsc-template-overlay",
  });
}
