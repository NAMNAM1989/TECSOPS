import type { LabelSheetFormat } from "../utils/labelSheetFormat";
import type { ThermalLabelPrinterProfile } from "./printTypes";
import {
  THERMAL_LABEL_FORMAT_PRESETS,
  normalizeLabelSheetFormat,
} from "../../shared/thermalLabelPresets.mjs";

export function labelSheetFormatLabel(f: LabelSheetFormat): string {
  return f === "100x50" ? "100×50 mm" : "100×80 mm";
}

/** Khổ tem gắn với profile — suy ra từ field hoặc chiều cao tem (migrate cũ). */
export function resolveThermalProfileLabelFormat(profile: ThermalLabelPrinterProfile): LabelSheetFormat {
  if (profile.labelSheetFormat === "100x50" || profile.labelSheetFormat === "100x80") {
    return profile.labelSheetFormat;
  }
  if (profile.labelHeightMm > 0 && profile.labelHeightMm <= 55) return "100x50";
  return "100x80";
}

export function withThermalLabelFormat(
  profile: ThermalLabelPrinterProfile,
  format?: LabelSheetFormat
): ThermalLabelPrinterProfile {
  const labelSheetFormat = format ?? resolveThermalProfileLabelFormat(profile);
  const key = normalizeLabelSheetFormat(labelSheetFormat);
  return {
    ...profile,
    labelSheetFormat: key,
    ...THERMAL_LABEL_FORMAT_PRESETS[key],
  };
}
