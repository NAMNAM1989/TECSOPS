import type { ScaleTicketFormData } from "../../utils/mapBookingToScaleTicketFormData";
import { buildScscWeighOverlayValues } from "../../printing/scscWeigh/scscWeighTemplate";
import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";
import { defaultScscWeighPrintSettings } from "../../printing/scscWeigh/scscWeighPrintSettingsCore";
import type { LabelDataContext } from "../core/types";

export function buildScscLabelContextFromOverlay(overlay: Record<string, string>): LabelDataContext {
  const ctx: LabelDataContext = {};
  for (const [k, v] of Object.entries(overlay)) {
    ctx[k] = v;
  }
  return ctx;
}

export function buildScscLabelContext(
  form: ScaleTicketFormData,
  shared: ScscWeighPrintSettings = defaultScscWeighPrintSettings()
): LabelDataContext {
  return buildScscLabelContextFromOverlay(buildScscWeighOverlayValues(form, shared));
}

/** @deprecated dùng buildScscLabelContext */
export function buildScscLabelContextLegacy(form: ScaleTicketFormData): LabelDataContext {
  const ctx: LabelDataContext = {};
  for (const [k, val] of Object.entries(form)) {
    if (val === undefined || val === null) continue;
    ctx[k] = typeof val === "boolean" ? val : String(val);
  }
  return ctx;
}
