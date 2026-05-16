import { useCallback, useState } from "react";
import type { PrinterProfile, PrinterProfileStoreV1 } from "../printing/printTypes";
import type { PrinterProfilesCatalog } from "../printing/printerProfilesCore";
import {
  loadPrinterProfileStore,
  savePrinterProfileStore,
  setActiveA4WeighProfileId,
  setActiveThermalProfileId,
  syncLegacyScscOffsetsFromProfile,
  upsertPrinterProfile,
} from "../printing/printerProfileStorage";
import { isA4WeighProfile } from "../printing/printerProfileStorage";
import { catalogFromLocalStore } from "../printing/printerProfilesSync";
import type { ShipmentMutation } from "../utils/shipmentMutations";
import type { AppState } from "../utils/shipmentMutations";

type MutateFn = (mutation: ShipmentMutation) => Promise<AppState | null>;

export function usePrinterProfiles(opts?: { pushCatalog?: MutateFn }) {
  const [store, setStore] = useState<PrinterProfileStoreV1>(() => loadPrinterProfileStore());
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStore(loadPrinterProfileStore());
  }, []);

  const pushCatalog = useCallback(
    async (catalog: PrinterProfilesCatalog) => {
      if (!opts?.pushCatalog) return;
      setSyncStatus("syncing");
      setSyncError(null);
      try {
        await opts.pushCatalog({ action: "SET_PRINTER_PROFILES", catalog });
        setSyncStatus("ok");
      } catch (e) {
        setSyncStatus("error");
        setSyncError(e instanceof Error ? e.message : "Không đồng bộ được profile lên server");
      }
    },
    [opts]
  );

  const saveStore = useCallback(
    (next: PrinterProfileStoreV1) => {
      savePrinterProfileStore(next);
      setStore(next);
      void pushCatalog(catalogFromLocalStore(next));
    },
    [pushCatalog]
  );

  const upsert = useCallback(
    (profile: PrinterProfile) => {
      const next = upsertPrinterProfile(profile);
      if (isA4WeighProfile(profile)) syncLegacyScscOffsetsFromProfile(profile);
      setStore(next);
      void pushCatalog(catalogFromLocalStore(next));
      return next;
    },
    [pushCatalog]
  );

  const setActiveThermal = useCallback((id: string) => {
    const next = setActiveThermalProfileId(id);
    setStore(next);
  }, []);

  const setActiveA4 = useCallback((id: string) => {
    const next = setActiveA4WeighProfileId(id);
    const p = next.profiles.find((x) => x.id === id);
    if (p && isA4WeighProfile(p)) syncLegacyScscOffsetsFromProfile(p);
    setStore(next);
  }, []);

  return {
    store,
    refresh,
    saveStore,
    upsert,
    setActiveThermal,
    setActiveA4,
    syncStatus,
    syncError,
    pushCatalogNow: () => pushCatalog(catalogFromLocalStore(loadPrinterProfileStore())),
  };
}
