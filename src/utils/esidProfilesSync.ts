import { credFetch } from "../apiFetch";
import { parseAppState } from "./appStateParse";
import { debugWarn } from "./debugLog";
import {
  esidRegistrantStoreHasUserData,
  loadEsidRegistrantStore,
  normalizeEsidRegistrantStore,
  saveEsidRegistrantStore,
  type EsidRegistrantStoreV1,
} from "./esidRegistrantProfile";
import {
  esidAgentStoreHasUserData,
  loadEsidAgentStore,
  normalizeEsidAgentStore,
  saveEsidAgentStore,
  type EsidAgentStoreV1,
} from "./esidAgentProfile";
import type { AppState } from "./shipmentMutations";

/**
 * Đồng bộ hồ sơ Người khai / Agent từ app_state (Postgres) ↔ localStorage.
 * Server là nguồn sự thật khi đã có dữ liệu; máy mới không phải nhập lại.
 */

export function applyServerEsidRegistrantStore(serverRaw: unknown): EsidRegistrantStoreV1 {
  const server = normalizeEsidRegistrantStore(serverRaw);
  if (esidRegistrantStoreHasUserData(server)) {
    saveEsidRegistrantStore(server);
    return server;
  }
  return loadEsidRegistrantStore();
}

export function applyServerEsidAgentStore(serverRaw: unknown): EsidAgentStoreV1 {
  const server = normalizeEsidAgentStore(serverRaw);
  if (esidAgentStoreHasUserData(server)) {
    saveEsidAgentStore(server);
    return server;
  }
  return loadEsidAgentStore();
}

/** Gọi khi nhận /api/state hoặc socket sync — hydrate local + đẩy local lên nếu server trống. */
export function hydrateEsidProfilesFromAppState(state: AppState | null | undefined): void {
  if (!state) return;
  applyServerEsidRegistrantStore(state.esidRegistrantStore);
  applyServerEsidAgentStore(state.esidAgentStore);

  const serverRegEmpty = !esidRegistrantStoreHasUserData(
    normalizeEsidRegistrantStore(state.esidRegistrantStore)
  );
  const serverAgtEmpty = !esidAgentStoreHasUserData(normalizeEsidAgentStore(state.esidAgentStore));
  const localReg = loadEsidRegistrantStore();
  const localAgt = loadEsidAgentStore();

  if (serverRegEmpty && esidRegistrantStoreHasUserData(localReg)) {
    void pushEsidRegistrantStore(localReg);
  }
  if (serverAgtEmpty && esidAgentStoreHasUserData(localAgt)) {
    void pushEsidAgentStore(localAgt);
  }
}

export async function pushEsidRegistrantStore(store?: EsidRegistrantStoreV1): Promise<boolean> {
  const next = normalizeEsidRegistrantStore(store ?? loadEsidRegistrantStore());
  saveEsidRegistrantStore(next);
  try {
    const res = await fetch("/api/mutation", {
      ...credFetch,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SET_ESID_REGISTRANT_STORE", store: next }),
    });
    if (!res.ok) {
      debugWarn("esid-profiles", "push registrant failed", res.status);
      return false;
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = parseAppState(body);
    if (parsed?.esidRegistrantStore) {
      applyServerEsidRegistrantStore(parsed.esidRegistrantStore);
    }
    return true;
  } catch (e) {
    debugWarn("esid-profiles", "push registrant error", e);
    return false;
  }
}

export async function pushEsidAgentStore(store?: EsidAgentStoreV1): Promise<boolean> {
  const next = normalizeEsidAgentStore(store ?? loadEsidAgentStore());
  saveEsidAgentStore(next);
  try {
    const res = await fetch("/api/mutation", {
      ...credFetch,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SET_ESID_AGENT_STORE", store: next }),
    });
    if (!res.ok) {
      debugWarn("esid-profiles", "push agent failed", res.status);
      return false;
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = parseAppState(body);
    if (parsed?.esidAgentStore) {
      applyServerEsidAgentStore(parsed.esidAgentStore);
    }
    return true;
  } catch (e) {
    debugWarn("esid-profiles", "push agent error", e);
    return false;
  }
}
