import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import type { ThermalLabelPrinterProfile, A4WeighReceiptPrinterProfile } from "../../printing/printTypes";
import { resolveThermalProfileLabelFormat } from "../../printing/thermalLabelFormat";
import { hasThermalFieldCalibration } from "../../printing/thermalLabel/thermalFieldOverrides";
import { documentKindFromLabelFormat, getBuiltinTemplate } from "../core/defaultTemplates";
import { mergeDesignerTemplateWithBuiltin, shouldUseFullTemplateForTspl } from "../core/templatePreserve";
import { migrateThermalOverridesToTemplate } from "../core/templateMigrate";
import { bindLabelTemplate } from "../core/bindingResolver";
import type { LabelDocumentKind, LabelTemplateV1 } from "../core/types";
import { buildShipmentLabelContext } from "../data/shipmentDataContext";
import { labelTemplateToTsplSlots, labelTemplateToTsplSlotsAsync } from "../render/tsplRenderer";
import type { LabelSheetFormat } from "../../utils/labelSheetFormat";

export { usesLabelTemplateForPreview } from "../core/templatePreserve";

/** TSPL: căn chỉnh field hoặc template có đường/bảng/ảnh thêm. */
export function usesLabelDesignerTemplate(profile: ThermalLabelPrinterProfile): boolean {
  const kind = profileDocumentKind(profile);
  if (shouldUseFullTemplateForTspl(profile, kind)) return true;
  return hasThermalFieldCalibration(profile.thermalFieldOverrides);
}

export function resolveThermalLabelTemplate(profile: ThermalLabelPrinterProfile): LabelTemplateV1 {
  const format = resolveThermalProfileLabelFormat(profile);
  const kind = documentKindFromLabelFormat(format);

  if (shouldUseFullTemplateForTspl(profile, kind) && profile.labelTemplate?.objects.length) {
    return mergeDesignerTemplateWithBuiltin(structuredClone(profile.labelTemplate), kind);
  }
  if (hasThermalFieldCalibration(profile.thermalFieldOverrides)) {
    return migrateThermalOverridesToTemplate(format, profile.thermalFieldOverrides);
  }
  if (profile.labelTemplate?.objects.length) {
    return mergeDesignerTemplateWithBuiltin(structuredClone(profile.labelTemplate), kind);
  }
  return getBuiltinTemplate(kind);
}

export function resolveTemplateForKind(
  profile: { labelTemplate?: LabelTemplateV1 | null },
  kind: LabelDocumentKind
): LabelTemplateV1 {
  if (
    profile.labelTemplate?.version === 1 &&
    profile.labelTemplate.documentKind === kind &&
    profile.labelTemplate.objects.length > 0
  ) {
    return mergeDesignerTemplateWithBuiltin(structuredClone(profile.labelTemplate), kind);
  }
  return getBuiltinTemplate(kind);
}

export function buildThermalTsplBodyFromTemplate(
  shipment: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides: AirlineLabelOverrides | null | undefined,
  baseBody: Record<string, unknown>
): Record<string, unknown> {
  if (!usesLabelDesignerTemplate(profile)) {
    return baseBody;
  }
  const template = resolveThermalLabelTemplate(profile);
  const ctx = buildShipmentLabelContext(shipment, airlineLabelOverrides);
  const bound = bindLabelTemplate(template, ctx);
  const thermalSlots = labelTemplateToTsplSlots(bound).map((s) => ({
    key: s.key,
    kind: s.kind,
    text: s.text ?? "",
    x: s.x,
    y: s.y,
    font: s.font ?? "4",
    mulX: s.mulX ?? 1,
    mulY: s.mulY ?? 1,
    heightMm: s.heightMm,
    widthMm: s.widthMm,
  }));
  return { ...baseBody, thermalSlots };
}

function mapSlotsForApi(slots: Awaited<ReturnType<typeof labelTemplateToTsplSlotsAsync>>) {
  return slots.map((s) => ({
    key: s.key,
    kind: s.kind,
    text: s.text ?? "",
    x: s.x,
    y: s.y,
    font: s.font ?? "4",
    mulX: s.mulX ?? 1,
    mulY: s.mulY ?? 1,
    heightMm: s.heightMm,
    widthMm: s.widthMm,
    widthBytes: s.widthBytes,
    heightDots: s.heightDots,
    bitmapHex: s.bitmapHex,
  }));
}

/** Body TSPL có BITMAP ảnh (gọi trước khi POST /api/tspl). */
export async function buildThermalTsplBodyFromTemplateAsync(
  shipment: Shipment,
  profile: ThermalLabelPrinterProfile,
  airlineLabelOverrides: AirlineLabelOverrides | null | undefined,
  baseBody: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!usesLabelDesignerTemplate(profile)) return baseBody;
  const template = resolveThermalLabelTemplate(profile);
  const ctx = buildShipmentLabelContext(shipment, airlineLabelOverrides);
  const bound = bindLabelTemplate(template, ctx);
  const dpi = bound.page.dpi ?? 203;
  const thermalSlots = mapSlotsForApi(await labelTemplateToTsplSlotsAsync(bound, dpi));
  return { ...baseBody, thermalSlots };
}

export function profileDocumentKind(
  profile: ThermalLabelPrinterProfile | A4WeighReceiptPrinterProfile
): LabelDocumentKind {
  if (profile.type === "a4-browser") return "scsc-weigh-a4";
  return documentKindFromLabelFormat(resolveThermalProfileLabelFormat(profile));
}

export function labelFormatFromKind(kind: LabelDocumentKind): LabelSheetFormat | null {
  if (kind === "thermal-cargo-100x50") return "100x50";
  if (kind === "thermal-cargo-100x80") return "100x80";
  return null;
}
