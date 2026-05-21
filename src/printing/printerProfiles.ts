import { LABEL_DPI, LABEL_GAP_MM } from "../constants/labelDimensions";
import type { A4WeighReceiptPrinterProfile, PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";
import { withThermalLabelFormat } from "./thermalLabelFormat";

export const DEFAULT_THERMAL_PROFILE_ID = "thermal-100x80";
/** @deprecated Dùng `thermal-100x80` — giữ để migrate store cũ. */
export const LEGACY_THERMAL_PROFILE_ID = "thermal-default";
export const DEFAULT_THERMAL_PROFILE_100x50_ID = "thermal-100x50";
export const DEFAULT_A4_WEIGH_PROFILE_ID = "a4-weigh-default";

export const DEFAULT_THERMAL_LABEL_PROFILE: ThermalLabelPrinterProfile = withThermalLabelFormat({
  id: DEFAULT_THERMAL_PROFILE_ID,
  name: "Tem 100×80 — gán IP máy 80mm",
  type: "thermal-tspl",
  connection: "tcp",
  host: "",
  port: 9100,
  dpi: LABEL_DPI,
  labelWidthMm: 100,
  labelHeightMm: 80,
  pageWidthMm: 80,
  pageHeightMm: 100,
  gapMm: LABEL_GAP_MM,
  rotation: 90,
  offsetXmm: 0,
  offsetYmm: 0,
  speed: 4,
  density: 8,
  copiesDefault: 1,
  labelSheetFormat: "100x80",
}, "100x80");

export const DEFAULT_THERMAL_LABEL_PROFILE_100x50: ThermalLabelPrinterProfile = withThermalLabelFormat({
  id: DEFAULT_THERMAL_PROFILE_100x50_ID,
  name: "Tem 100×50 — gán IP máy 50mm",
  type: "thermal-tspl",
  connection: "tcp",
  host: "",
  port: 9100,
  dpi: LABEL_DPI,
  labelWidthMm: 100,
  labelHeightMm: 50,
  pageWidthMm: 50,
  pageHeightMm: 100,
  gapMm: LABEL_GAP_MM,
  rotation: 90,
  offsetXmm: 0,
  offsetYmm: 0,
  speed: 4,
  density: 8,
  copiesDefault: 1,
  labelSheetFormat: "100x50",
}, "100x50");

export const DEFAULT_A4_WEIGH_PROFILE: A4WeighReceiptPrinterProfile = {
  id: DEFAULT_A4_WEIGH_PROFILE_ID,
  name: "Tờ cân A4 (mặc định)",
  type: "a4-browser",
  paper: "A4",
  offsetXmm: 0,
  offsetYmm: 0,
  scaleX: 1,
  scaleY: 1,
  templateVersion: "scsc-weigh-v2",
  partyLineGapMm: 6,
  partyAddressFontMm: 3,
  partyNameFontMm: 4,
  partyContactFontMm: 3,
  notes: "",
};

export function createDefaultPrinterProfileStore(): PrinterProfileStoreV1 {
  return {
    version: 1,
    activeThermalProfileId: DEFAULT_THERMAL_PROFILE_ID,
    activeA4WeighProfileId: DEFAULT_A4_WEIGH_PROFILE_ID,
    profiles: [DEFAULT_THERMAL_LABEL_PROFILE, DEFAULT_THERMAL_LABEL_PROFILE_100x50, DEFAULT_A4_WEIGH_PROFILE],
    updatedAt: new Date().toISOString(),
  };
}

export function findProfileById<T extends { id: string }>(
  store: PrinterProfileStoreV1,
  id: string
): T | undefined {
  return store.profiles.find((p) => p.id === id) as T | undefined;
}

export function getActiveThermalProfile(store: PrinterProfileStoreV1): ThermalLabelPrinterProfile {
  return (
    findProfileById<ThermalLabelPrinterProfile>(store, store.activeThermalProfileId) ??
    DEFAULT_THERMAL_LABEL_PROFILE
  );
}

export function getActiveA4WeighProfile(store: PrinterProfileStoreV1): A4WeighReceiptPrinterProfile {
  return (
    findProfileById<A4WeighReceiptPrinterProfile>(store, store.activeA4WeighProfileId) ??
    DEFAULT_A4_WEIGH_PROFILE
  );
}
