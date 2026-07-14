import type { LabelSheetFormat } from "../utils/labelSheetFormat";
import { saveLabelSheetFormat } from "../utils/labelSheetFormat";
import type { PrinterProfile, PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";

/** Kích thước tem + khổ trang theo từng loại tem (XP-470B: trang = tem, không xoay). */
export const THERMAL_LABEL_FORMAT_PRESETS: Record<
  LabelSheetFormat,
  Pick<ThermalLabelPrinterProfile, "labelWidthMm" | "labelHeightMm" | "pageWidthMm" | "pageHeightMm">
> = {
  "100x80": { labelWidthMm: 100, labelHeightMm: 80, pageWidthMm: 100, pageHeightMm: 80 },
  "100x50": { labelWidthMm: 100, labelHeightMm: 50, pageWidthMm: 100, pageHeightMm: 50 },
};

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
  return {
    ...profile,
    labelSheetFormat,
    ...THERMAL_LABEL_FORMAT_PRESETS[labelSheetFormat],
  };
}

export function labelFormatMismatch(
  profile: ThermalLabelPrinterProfile,
  currentFormat: LabelSheetFormat
): boolean {
  return resolveThermalProfileLabelFormat(profile) !== currentFormat;
}

/** Đồng bộ khổ tem toàn app (localStorage) theo profile đang chọn. */
export function syncLabelSheetFormatFromProfile(profile: ThermalLabelPrinterProfile): LabelSheetFormat {
  const format = resolveThermalProfileLabelFormat(profile);
  saveLabelSheetFormat(format);
  return format;
}

function isThermalProfile(p: PrinterProfile): p is ThermalLabelPrinterProfile {
  return p.type === "thermal-tspl";
}

/** Profile nhãn đúng khổ (ưu tiên profile đang active nếu trùng khổ). */
export function findThermalProfileByFormat(
  store: PrinterProfileStoreV1,
  format: LabelSheetFormat
): ThermalLabelPrinterProfile | undefined {
  const matches = store.profiles.filter(
    (p): p is ThermalLabelPrinterProfile =>
      isThermalProfile(p) && resolveThermalProfileLabelFormat(p) === format
  );
  if (!matches.length) return undefined;
  const active = matches.find((p) => p.id === store.activeThermalProfileId);
  return active ?? matches[0];
}

export function formatMismatchMessage(
  profile: ThermalLabelPrinterProfile,
  currentFormat: LabelSheetFormat
): string {
  const expected = resolveThermalProfileLabelFormat(profile);
  return `Profile «${profile.name}» dùng khổ ${labelSheetFormatLabel(expected)}, nhưng đang chọn ${labelSheetFormatLabel(currentFormat)}. Đổi profile hoặc khổ tem cho khớp.`;
}
