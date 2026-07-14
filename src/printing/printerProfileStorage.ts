import { createDefaultPrinterProfileStore } from "./printerProfiles";
import { migratePrinterProfileStore } from "./printerProfileMigrate";
import { syncLabelSheetFormatFromProfile } from "./thermalLabelFormat";
import type { PrinterProfile, PrinterProfileStoreV1, ThermalLabelPrinterProfile } from "./printTypes";

const STORAGE_KEY = "tecsops-printer-profiles-v1";

/** Báo UI reload profile sau khi lưu local. */
export const PRINTER_PROFILES_CHANGED_EVENT = "tecsops-printer-profiles-changed";

function notifyPrinterProfilesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRINTER_PROFILES_CHANGED_EVENT));
}

function safeParseStore(raw: string | null): PrinterProfileStoreV1 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PrinterProfileStoreV1 & { activeA4WeighProfileId?: string };
    if (data?.version !== 1 || !Array.isArray(data.profiles)) return null;
    return {
      version: 1,
      activeThermalProfileId: data.activeThermalProfileId,
      profiles: data.profiles.filter((p): p is ThermalLabelPrinterProfile => p?.type === "thermal-tspl"),
      updatedAt: data.updatedAt,
    };
  } catch {
    return null;
  }
}

export function loadPrinterProfileStore(): PrinterProfileStoreV1 {
  try {
    const existing = safeParseStore(localStorage.getItem(STORAGE_KEY));
    if (existing) {
      const migrated = migratePrinterProfileStore(existing);
      if (JSON.stringify(migrated) !== JSON.stringify(existing)) {
        savePrinterProfileStore(migrated);
      }
      const active = migrated.profiles.find((p) => p.id === migrated.activeThermalProfileId);
      if (active && isThermalProfile(active)) syncLabelSheetFormatFromProfile(active);
      return migrated;
    }
  } catch {
    /* ignore */
  }

  const created = createDefaultPrinterProfileStore();
  const active = created.profiles.find((p) => p.id === created.activeThermalProfileId);
  if (active && isThermalProfile(active)) syncLabelSheetFormatFromProfile(active);
  return created;
}

export function savePrinterProfileStore(store: PrinterProfileStoreV1): void {
  const next: PrinterProfileStoreV1 = {
    ...store,
    version: 1,
    profiles: store.profiles.filter(isThermalProfile),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyPrinterProfilesChanged();
  } catch {
    /* ignore */
  }
}

export function upsertPrinterProfile(profile: PrinterProfile): PrinterProfileStoreV1 {
  if (!isThermalProfile(profile)) return loadPrinterProfileStore();
  const store = loadPrinterProfileStore();
  const idx = store.profiles.findIndex((p) => p.id === profile.id);
  const profiles =
    idx >= 0
      ? store.profiles.map((p, i) => (i === idx ? profile : p))
      : [...store.profiles, profile];
  const next = { ...store, profiles };
  savePrinterProfileStore(next);
  return next;
}

export function setActiveThermalProfileId(id: string): PrinterProfileStoreV1 {
  const store = loadPrinterProfileStore();
  const next = { ...store, activeThermalProfileId: id };
  savePrinterProfileStore(next);
  const active = next.profiles.find((p) => p.id === id);
  if (active && isThermalProfile(active)) syncLabelSheetFormatFromProfile(active);
  return next;
}

export function isThermalProfile(p: PrinterProfile): p is ThermalLabelPrinterProfile {
  return p.type === "thermal-tspl";
}
