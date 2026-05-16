import { LABEL_DPI, LABEL_GAP_MM, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "../constants/labelDimensions";
import type { A4WeighReceiptPrinterProfile, PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";

export const DEFAULT_THERMAL_PROFILE_ID = "thermal-default";
export const DEFAULT_A4_WEIGH_PROFILE_ID = "a4-weigh-default";

export const DEFAULT_THERMAL_LABEL_PROFILE: ThermalLabelPrinterProfile = {
  id: DEFAULT_THERMAL_PROFILE_ID,
  name: "Nhãn nhiệt (mặc định)",
  type: "thermal-tspl",
  connection: "tcp",
  host: "",
  port: 9100,
  dpi: LABEL_DPI,
  labelWidthMm: LABEL_WIDTH_MM,
  labelHeightMm: LABEL_HEIGHT_MM,
  pageWidthMm: 80,
  pageHeightMm: 100,
  gapMm: LABEL_GAP_MM,
  rotation: 90,
  offsetXmm: 0,
  offsetYmm: 0,
  speed: 4,
  density: 8,
  copiesDefault: 1,
};

export const DEFAULT_A4_WEIGH_PROFILE: A4WeighReceiptPrinterProfile = {
  id: DEFAULT_A4_WEIGH_PROFILE_ID,
  name: "Tờ cân A4 (mặc định)",
  type: "a4-browser",
  paper: "A4",
  offsetXmm: 0,
  offsetYmm: 0,
  scaleX: 1,
  scaleY: 1,
  templateVersion: "scsc-weigh-v1",
  notes: "",
};

export function createDefaultPrinterProfileStore(): PrinterProfileStoreV1 {
  return {
    version: 1,
    activeThermalProfileId: DEFAULT_THERMAL_PROFILE_ID,
    activeA4WeighProfileId: DEFAULT_A4_WEIGH_PROFILE_ID,
    profiles: [DEFAULT_THERMAL_LABEL_PROFILE, DEFAULT_A4_WEIGH_PROFILE],
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
