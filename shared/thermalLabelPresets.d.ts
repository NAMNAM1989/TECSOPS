export type ThermalLabelFormatKey = "100x80" | "100x50";

export type ThermalLabelPresetDims = {
  labelWidthMm: number;
  labelHeightMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

export declare const THERMAL_LABEL_FORMAT_PRESETS: Record<
  ThermalLabelFormatKey,
  ThermalLabelPresetDims
>;

export declare function thermalPresetForFormat(
  format: string | undefined | null
): ThermalLabelPresetDims;

export declare function normalizeLabelSheetFormat(
  raw: unknown
): ThermalLabelFormatKey;
