import {
  DEFAULT_THERMAL_LABEL_PROFILE_100x50,
  DEFAULT_THERMAL_PROFILE_100x50_ID,
  DEFAULT_THERMAL_PROFILE_ID,
  LEGACY_THERMAL_PROFILE_ID,
} from "./printerProfiles";
import type { PrinterProfile, PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";
import { withThermalLabelFormat } from "./thermalLabelFormat";

function isThermalProfile(p: PrinterProfile): p is ThermalLabelPrinterProfile {
  return p.type === "thermal-tspl";
}

/** Chuẩn hóa store cũ: thêm khổ tem, profile 100×50, migrate id legacy. */
export function migratePrinterProfileStore(store: PrinterProfileStoreV1): PrinterProfileStoreV1 {
  let profiles = store.profiles.map((p) =>
    isThermalProfile(p) ? withThermalLabelFormat(p) : p
  );

  if (!profiles.some((p) => p.id === DEFAULT_THERMAL_PROFILE_100x50_ID)) {
    profiles = [...profiles, DEFAULT_THERMAL_LABEL_PROFILE_100x50];
  }

  const legacyIdx = profiles.findIndex((p) => p.id === LEGACY_THERMAL_PROFILE_ID && isThermalProfile(p));
  if (legacyIdx >= 0 && !profiles.some((p) => p.id === DEFAULT_THERMAL_PROFILE_ID)) {
    const legacy = profiles[legacyIdx] as ThermalLabelPrinterProfile;
    profiles = profiles.map((p, i) =>
      i === legacyIdx
        ? withThermalLabelFormat(
            { ...legacy, id: DEFAULT_THERMAL_PROFILE_ID, name: legacy.name || "Tem 100×80" },
            "100x80"
          )
        : p
    );
  }

  let activeThermalProfileId = store.activeThermalProfileId;
  if (activeThermalProfileId === LEGACY_THERMAL_PROFILE_ID) {
    activeThermalProfileId = DEFAULT_THERMAL_PROFILE_ID;
  }
  if (!profiles.some((p) => p.id === activeThermalProfileId)) {
    activeThermalProfileId =
      profiles.find((p) => isThermalProfile(p) && p.labelSheetFormat === "100x80")?.id ??
      profiles.find(isThermalProfile)?.id ??
      DEFAULT_THERMAL_PROFILE_ID;
  }

  return { ...store, profiles, activeThermalProfileId };
}
