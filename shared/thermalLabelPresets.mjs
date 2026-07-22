/**
 * Preset khổ tem thermal — nguồn sự thật cho client + server normalize.
 * Client vẫn có thể force ghi đè mm qua withThermalLabelFormat;
 * server dùng làm fallback khi thiếu field.
 */

export const THERMAL_LABEL_FORMAT_PRESETS = {
  "100x80": { labelWidthMm: 100, labelHeightMm: 80, pageWidthMm: 100, pageHeightMm: 80 },
  "100x50": { labelWidthMm: 100, labelHeightMm: 50, pageWidthMm: 100, pageHeightMm: 50 },
};

/** `100x50` hoặc mặc định `100x80`. */
export function thermalPresetForFormat(format) {
  return format === "100x50"
    ? THERMAL_LABEL_FORMAT_PRESETS["100x50"]
    : THERMAL_LABEL_FORMAT_PRESETS["100x80"];
}

export function normalizeLabelSheetFormat(raw) {
  return raw === "100x50" ? "100x50" : "100x80";
}
