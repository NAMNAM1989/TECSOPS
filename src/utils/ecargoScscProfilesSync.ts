import { credFetch } from "../apiFetch";
import { parseAppState } from "./appStateParse";
import { debugWarn } from "./debugLog";
import {
  ecargoScscStoreHasUserData,
  loadEcargoScscStore,
  normalizeEcargoScscStore,
  saveEcargoScscStore,
  type EcargoScscStoreV1,
} from "./ecargoScscProfile";
import type { AppState } from "./shipmentMutations";

function applyServerStore(
  serverRaw: unknown,
  normalize: (raw: unknown) => EcargoScscStoreV1,
  hasUserData: (s: EcargoScscStoreV1) => boolean,
  save: (s: EcargoScscStoreV1) => void,
  loadLocal: () => EcargoScscStoreV1
): EcargoScscStoreV1 {
  const server = normalize(serverRaw);
  if (hasUserData(server)) {
    save(server);
    return server;
  }
  return loadLocal();
}

export function applyServerEcargoScscStore(serverRaw: unknown): EcargoScscStoreV1 {
  return applyServerStore(
    serverRaw,
    normalizeEcargoScscStore,
    ecargoScscStoreHasUserData,
    saveEcargoScscStore,
    loadEcargoScscStore
  );
}

/** Gọi khi nhận /api/state hoặc socket sync. */
export function hydrateEcargoScscFromAppState(state: AppState | null | undefined): void {
  if (!state) return;
  applyServerEcargoScscStore(state.ecargoScscStore);

  const serverEmpty = !ecargoScscStoreHasUserData(
    normalizeEcargoScscStore(state.ecargoScscStore)
  );
  const local = loadEcargoScscStore();
  if (serverEmpty && ecargoScscStoreHasUserData(local)) {
    void pushEcargoScscStore(local);
  }
}

export async function pushEcargoScscStore(store?: EcargoScscStoreV1): Promise<boolean> {
  const next = normalizeEcargoScscStore(store ?? loadEcargoScscStore());
  saveEcargoScscStore(next);
  try {
    const res = await fetch("/api/mutation", {
      ...credFetch,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SET_ECARGO_SCSC_STORE", store: next }),
    });
    if (!res.ok) {
      debugWarn("ecargo-scsc", "push failed", res.status);
      return false;
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = parseAppState(body);
    if (parsed?.ecargoScscStore) {
      applyServerEcargoScscStore(parsed.ecargoScscStore);
    }
    return true;
  } catch (e) {
    debugWarn("ecargo-scsc", "push error", e);
    return false;
  }
}
