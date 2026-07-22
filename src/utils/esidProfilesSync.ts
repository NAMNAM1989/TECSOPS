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

type StoreKind = "registrant" | "agent";

function applyServerStore<T>(
  serverRaw: unknown,
  normalize: (raw: unknown) => T,
  hasUserData: (s: T) => boolean,
  save: (s: T) => void,
  loadLocal: () => T
): T {
  const server = normalize(serverRaw);
  if (hasUserData(server)) {
    save(server);
    return server;
  }
  return loadLocal();
}

async function pushStore<T>(opts: {
  kind: StoreKind;
  action: "SET_ESID_REGISTRANT_STORE" | "SET_ESID_AGENT_STORE";
  store: T;
  normalize: (raw: unknown) => T;
  saveLocal: (s: T) => void;
  applyFromState: (parsed: AppState) => void;
  stateKey: "esidRegistrantStore" | "esidAgentStore";
}): Promise<boolean> {
  const next = opts.normalize(opts.store);
  opts.saveLocal(next);
  try {
    const res = await fetch("/api/mutation", {
      ...credFetch,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: opts.action, store: next }),
    });
    if (!res.ok) {
      debugWarn("esid-profiles", `push ${opts.kind} failed`, res.status);
      return false;
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = parseAppState(body);
    if (parsed?.[opts.stateKey]) {
      opts.applyFromState(parsed);
    }
    return true;
  } catch (e) {
    debugWarn("esid-profiles", `push ${opts.kind} error`, e);
    return false;
  }
}

export function applyServerEsidRegistrantStore(serverRaw: unknown): EsidRegistrantStoreV1 {
  return applyServerStore(
    serverRaw,
    normalizeEsidRegistrantStore,
    esidRegistrantStoreHasUserData,
    saveEsidRegistrantStore,
    loadEsidRegistrantStore
  );
}

export function applyServerEsidAgentStore(serverRaw: unknown): EsidAgentStoreV1 {
  return applyServerStore(
    serverRaw,
    normalizeEsidAgentStore,
    esidAgentStoreHasUserData,
    saveEsidAgentStore,
    loadEsidAgentStore
  );
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
  return pushStore({
    kind: "registrant",
    action: "SET_ESID_REGISTRANT_STORE",
    store: store ?? loadEsidRegistrantStore(),
    normalize: normalizeEsidRegistrantStore,
    saveLocal: saveEsidRegistrantStore,
    stateKey: "esidRegistrantStore",
    applyFromState: (parsed) => {
      if (parsed.esidRegistrantStore) applyServerEsidRegistrantStore(parsed.esidRegistrantStore);
    },
  });
}

export async function pushEsidAgentStore(store?: EsidAgentStoreV1): Promise<boolean> {
  return pushStore({
    kind: "agent",
    action: "SET_ESID_AGENT_STORE",
    store: store ?? loadEsidAgentStore(),
    normalize: normalizeEsidAgentStore,
    saveLocal: saveEsidAgentStore,
    stateKey: "esidAgentStore",
    applyFromState: (parsed) => {
      if (parsed.esidAgentStore) applyServerEsidAgentStore(parsed.esidAgentStore);
    },
  });
}
