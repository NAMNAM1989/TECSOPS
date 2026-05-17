import { credFetch } from "../apiFetch";
import { parseAppState } from "../utils/appStateParse";
import { debugWarn } from "../utils/debugLog";
import type { PrinterProfileStoreV1 } from "./printTypes";
import {
  clampPrinterProfilesCatalog,
  mergePrinterProfileCatalogs,
  type PrinterProfilesCatalog,
} from "./printerProfilesCore";
import {
  createDefaultPrinterProfileStore,
  DEFAULT_A4_WEIGH_PROFILE_ID,
  DEFAULT_THERMAL_PROFILE_ID,
} from "./printerProfiles";
import { loadPrinterProfileStore, savePrinterProfileStore } from "./printerProfileStorage";
import { isA4WeighProfile } from "./printerProfileStorage";
import { syncLegacyScscOffsetsFromProfile } from "./printerProfileStorage";

export function catalogFromLocalStore(store: PrinterProfileStoreV1): PrinterProfilesCatalog {
  return {
    version: 1,
    profiles: store.profiles,
    updatedAt: new Date().toISOString(),
  };
}

/** Áp catalog từ server vào localStorage; giữ active id của máy này nếu còn hợp lệ. */
export function mergeServerCatalogIntoLocalStore(serverRaw: unknown): PrinterProfileStoreV1 {
  const serverCatalog = clampPrinterProfilesCatalog(serverRaw);
  if (serverCatalog.profiles.length === 0) {
    return loadPrinterProfileStore();
  }
  const local = loadPrinterProfileStore();
  const mergedProfiles = mergePrinterProfileCatalogs(local.profiles, serverCatalog, {
    localCatalogUpdatedAt: local.updatedAt,
  });

  let activeThermalProfileId = local.activeThermalProfileId;
  let activeA4WeighProfileId = local.activeA4WeighProfileId;

  if (!mergedProfiles.some((p) => p.id === activeThermalProfileId)) {
    activeThermalProfileId =
      mergedProfiles.find((p) => p.id === DEFAULT_THERMAL_PROFILE_ID)?.id ??
      mergedProfiles.find((p) => p.type === "thermal-tspl")?.id ??
      DEFAULT_THERMAL_PROFILE_ID;
  }
  if (!mergedProfiles.some((p) => p.id === activeA4WeighProfileId)) {
    activeA4WeighProfileId =
      mergedProfiles.find((p) => p.id === DEFAULT_A4_WEIGH_PROFILE_ID)?.id ??
      mergedProfiles.find((p) => p.type === "a4-browser")?.id ??
      DEFAULT_A4_WEIGH_PROFILE_ID;
  }

  const next: PrinterProfileStoreV1 = {
    version: 1,
    profiles: mergedProfiles.length ? mergedProfiles : createDefaultPrinterProfileStore().profiles,
    activeThermalProfileId,
    activeA4WeighProfileId,
    updatedAt: serverCatalog.updatedAt || new Date().toISOString(),
  };

  savePrinterProfileStore(next);
  const a4 = next.profiles.find((p) => p.id === activeA4WeighProfileId);
  if (a4 && isA4WeighProfile(a4)) syncLegacyScscOffsetsFromProfile(a4);
  return next;
}

/** Đẩy profile máy in local lên server (giữ tọa độ phiếu cân SCSC sau khi lưu). */
export async function pushLocalPrinterProfilesCatalog(): Promise<void> {
  try {
    const store = loadPrinterProfileStore();
    const catalog = catalogFromLocalStore(store);
    const res = await fetch("/api/mutation", {
      ...credFetch,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SET_PRINTER_PROFILES", catalog }),
    });
    if (!res.ok) {
      debugWarn("printer-profiles", "push catalog failed", res.status);
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    const next = parseAppState(body);
    if (next?.printerProfiles) {
      mergeServerCatalogIntoLocalStore(next.printerProfiles);
    }
  } catch (e) {
    debugWarn("printer-profiles", "push catalog error", e);
  }
}
