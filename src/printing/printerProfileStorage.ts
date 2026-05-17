import { createDefaultPrinterProfileStore, DEFAULT_A4_WEIGH_PROFILE_ID } from "./printerProfiles";
import { migratePrinterProfileStore } from "./printerProfileMigrate";
import { syncLabelSheetFormatFromProfile } from "./thermalLabelFormat";
import type {
  A4WeighReceiptPrinterProfile,
  PrinterProfile,
  PrinterProfileStoreV1,
  ThermalLabelPrinterProfile,
} from "./printTypes";

const STORAGE_KEY = "tecsops-printer-profiles-v1";

/** Báo UI (preview in SCSC, Print Center) reload profile sau khi lưu local. */
export const PRINTER_PROFILES_CHANGED_EVENT = "tecsops-printer-profiles-changed";

function notifyPrinterProfilesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRINTER_PROFILES_CHANGED_EVENT));
}

/** Khóa legacy — chỉ dùng khi migrate lần đầu sang profile A4. */
const LEGACY_SCSC_OFFSET_X = "printOffsetX";
const LEGACY_SCSC_OFFSET_Y = "printOffsetY";

function safeParseStore(raw: string | null): PrinterProfileStoreV1 | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PrinterProfileStoreV1;
    if (data?.version !== 1 || !Array.isArray(data.profiles)) return null;
    return data;
  } catch {
    return null;
  }
}

function readLegacyScscOffset(): { offsetXmm: number; offsetYmm: number } | null {
  try {
    const rawX = localStorage.getItem(LEGACY_SCSC_OFFSET_X);
    const rawY = localStorage.getItem(LEGACY_SCSC_OFFSET_Y);
    if (rawX == null && rawY == null) return null;
    const x = Number(rawX ?? 0);
    const y = Number(rawY ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { offsetXmm: x, offsetYmm: y };
  } catch {
    return null;
  }
}

function applyLegacyScscOffsets(store: PrinterProfileStoreV1): PrinterProfileStoreV1 {
  const legacy = readLegacyScscOffset();
  if (!legacy) return store;

  const profiles = store.profiles.map((p) => {
    if (p.id !== DEFAULT_A4_WEIGH_PROFILE_ID || p.type !== "a4-browser") return p;
    return {
      ...p,
      offsetXmm: legacy.offsetXmm,
      offsetYmm: legacy.offsetYmm,
    };
  });

  return { ...store, profiles, updatedAt: new Date().toISOString() };
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

  const created = applyLegacyScscOffsets(createDefaultPrinterProfileStore());
  const active = created.profiles.find((p) => p.id === created.activeThermalProfileId);
  if (active && isThermalProfile(active)) syncLabelSheetFormatFromProfile(active);
  return created;
}

export function savePrinterProfileStore(store: PrinterProfileStoreV1): void {
  const next: PrinterProfileStoreV1 = {
    ...store,
    version: 1,
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

export function setActiveA4WeighProfileId(id: string): PrinterProfileStoreV1 {
  const store = loadPrinterProfileStore();
  const next = { ...store, activeA4WeighProfileId: id };
  savePrinterProfileStore(next);
  return next;
}

/** Đồng bộ offset profile A4 đang chọn về khóa legacy (giữ tương thích Phase 1). */
export function syncLegacyScscOffsetsFromProfile(profile: A4WeighReceiptPrinterProfile): void {
  try {
    localStorage.setItem(LEGACY_SCSC_OFFSET_X, String(profile.offsetXmm));
    localStorage.setItem(LEGACY_SCSC_OFFSET_Y, String(profile.offsetYmm));
  } catch {
    /* ignore */
  }
}

export function isThermalProfile(p: PrinterProfile): p is ThermalLabelPrinterProfile {
  return p.type === "thermal-tspl";
}

export function isA4WeighProfile(p: PrinterProfile): p is A4WeighReceiptPrinterProfile {
  return p.type === "a4-browser";
}
