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
  DEFAULT_THERMAL_PROFILE_ID,
} from "./printerProfiles";
import { loadPrinterProfileStore, savePrinterProfileStore } from "./printerProfileStorage";

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

  if (!mergedProfiles.some((p) => p.id === activeThermalProfileId)) {
    activeThermalProfileId =
      mergedProfiles.find((p) => p.id === DEFAULT_THERMAL_PROFILE_ID)?.id ??
      mergedProfiles.find((p) => p.type === "thermal-tspl")?.id ??
      DEFAULT_THERMAL_PROFILE_ID;
  }

  const next: PrinterProfileStoreV1 = {
    version: 1,
    profiles: mergedProfiles.length ? mergedProfiles : createDefaultPrinterProfileStore().profiles,
    activeThermalProfileId,
    updatedAt: (() => {
      const localAt = Date.parse(local.updatedAt || "");
      const serverAt = Date.parse(serverCatalog.updatedAt || "");
      const best =
        Number.isFinite(localAt) && Number.isFinite(serverAt)
          ? Math.max(localAt, serverAt)
          : Number.isFinite(localAt)
            ? localAt
            : Number.isFinite(serverAt)
              ? serverAt
              : Date.now();
      return new Date(best).toISOString();
    })(),
  };

  savePrinterProfileStore(next);
  return next;
}

/** Đẩy profile máy in local lên server. */
export async function pushLocalPrinterProfilesCatalog(): Promise<boolean> {
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
      return false;
    }
    const body: unknown = await res.json().catch(() => null);
    const next = parseAppState(body);
    if (next?.printerProfiles) {
      mergeServerCatalogIntoLocalStore(next.printerProfiles);
    }
    return true;
  } catch (e) {
    debugWarn("printer-profiles", "push catalog error", e);
    return false;
  }
}
