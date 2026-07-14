import { LABEL_DPI, LABEL_GAP_MM } from "../constants/labelDimensions";
import type { PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";
import { withThermalLabelFormat } from "./thermalLabelFormat";

export const DEFAULT_THERMAL_PROFILE_ID = "thermal-100x80";
/** @deprecated Dùng `thermal-100x80` — giữ để migrate store cũ. */
export const LEGACY_THERMAL_PROFILE_ID = "thermal-default";
export const DEFAULT_THERMAL_PROFILE_100x50_ID = "thermal-100x50";

/**
 * Profile mặc định cho Xprinter XP-470B:
 * - Máy 4″ direct thermal, 203 DPI, max print width 108mm
 * - Tem 100×80: SIZE 100 mm,80 mm — trang = tem, rotation 0
 */
export const DEFAULT_THERMAL_LABEL_PROFILE: ThermalLabelPrinterProfile = withThermalLabelFormat(
  {
    id: DEFAULT_THERMAL_PROFILE_ID,
    name: "Xprinter XP-470B — tem 100×80",
    type: "thermal-tspl",
    connection: "tcp",
    host: "",
    port: 9100,
    dpi: LABEL_DPI,
    labelWidthMm: 100,
    labelHeightMm: 80,
    pageWidthMm: 100,
    pageHeightMm: 80,
    gapMm: LABEL_GAP_MM,
    rotation: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    speed: 4,
    density: 10,
    copiesDefault: 1,
    labelSheetFormat: "100x80",
    notes: "XP-470B 4″ / 203DPI / max 108mm — in thẳng SIZE 100×80",
  },
  "100x80"
);

export const DEFAULT_THERMAL_LABEL_PROFILE_100x50: ThermalLabelPrinterProfile = withThermalLabelFormat(
  {
    id: DEFAULT_THERMAL_PROFILE_100x50_ID,
    name: "Xprinter XP-470B — tem 100×50",
    type: "thermal-tspl",
    connection: "tcp",
    host: "",
    port: 9100,
    dpi: LABEL_DPI,
    labelWidthMm: 100,
    labelHeightMm: 50,
    pageWidthMm: 100,
    pageHeightMm: 50,
    gapMm: LABEL_GAP_MM,
    rotation: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    speed: 4,
    density: 10,
    copiesDefault: 1,
    labelSheetFormat: "100x50",
    notes: "XP-470B 4″ — tem thấp 100×50",
  },
  "100x50"
);

export function createDefaultPrinterProfileStore(): PrinterProfileStoreV1 {
  return {
    version: 1,
    activeThermalProfileId: DEFAULT_THERMAL_PROFILE_ID,
    profiles: [DEFAULT_THERMAL_LABEL_PROFILE, DEFAULT_THERMAL_LABEL_PROFILE_100x50],
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
