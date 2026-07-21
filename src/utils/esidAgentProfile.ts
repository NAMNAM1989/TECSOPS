/**
 * Hồ sơ Agent ESID (giống người khai).
 * Lưu localStorage + đồng bộ Postgres — dùng chung mọi máy Ops.
 * Điền form TCS agentId + address/tel/email/vat từ hồ sơ này — không lấy theo từng lô.
 */
export type EsidAgentProfile = {
  id: string;
  name: string;
  address: string;
  tel: string;
  email: string;
  vat: string;
  fax: string;
  updatedAt: string;
};

export type EsidAgentStoreV1 = {
  version: 1;
  activeId: string;
  profiles: EsidAgentProfile[];
};

const STORAGE_KEY = "tecsops-esid-agent-v1";
export const ESID_AGENT_CHANGED_EVENT = "tecsops-esid-agent-changed";

function notifyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ESID_AGENT_CHANGED_EVENT));
}

function newId(): string {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyAgent(name = ""): EsidAgentProfile {
  return {
    id: newId(),
    name: name.trim(),
    address: "",
    tel: "",
    email: "",
    vat: "",
    fax: "",
    updatedAt: new Date().toISOString(),
  };
}

export function emptyAgentStore(): EsidAgentStoreV1 {
  const p = createEmptyAgent("");
  return { version: 1, activeId: p.id, profiles: [p] };
}

export function normalizeEsidAgentStore(raw: unknown): EsidAgentStoreV1 {
  if (!raw || typeof raw !== "object") return emptyAgentStore();
  const o = raw as EsidAgentStoreV1;
  if (o.version !== 1 || !Array.isArray(o.profiles)) return emptyAgentStore();
  const profiles = o.profiles
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || newId()),
      name: String(p.name || "").trim(),
      address: String(p.address || "").trim(),
      tel: String(p.tel || "").trim(),
      email: String(p.email || "").trim(),
      vat: String(p.vat || "").trim(),
      fax: String(p.fax || "").trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  if (!profiles.length) return emptyAgentStore();
  const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
  return { version: 1, activeId, profiles };
}

export function esidAgentStoreHasUserData(store: EsidAgentStoreV1): boolean {
  return store.profiles.some(
    (p) => p.name.trim() || p.address.trim() || p.tel.trim() || p.email.trim() || p.vat.trim()
  );
}

export function loadEsidAgentStore(): EsidAgentStoreV1 {
  try {
    const parsed = normalizeEsidAgentStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    if (esidAgentStoreHasUserData(parsed) || localStorage.getItem(STORAGE_KEY)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  const created = emptyAgentStore();
  saveEsidAgentStore(created);
  return created;
}

export function saveEsidAgentStore(store: EsidAgentStoreV1): void {
  const next = normalizeEsidAgentStore(store);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyChanged();
  } catch {
    /* ignore */
  }
}

export function getActiveEsidAgent(): EsidAgentProfile {
  const store = loadEsidAgentStore();
  return store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
}

export function updateActiveEsidAgent(
  patch: Partial<Pick<EsidAgentProfile, "name" | "address" | "tel" | "email" | "vat" | "fax">>
): EsidAgentProfile {
  const store = loadEsidAgentStore();
  const profiles = store.profiles.map((p) =>
    p.id === store.activeId
      ? {
          ...p,
          name: patch.name !== undefined ? String(patch.name).trim() : p.name,
          address: patch.address !== undefined ? String(patch.address).trim() : p.address,
          tel: patch.tel !== undefined ? String(patch.tel).trim() : p.tel,
          email: patch.email !== undefined ? String(patch.email).trim() : p.email,
          vat: patch.vat !== undefined ? String(patch.vat).trim() : p.vat,
          fax: patch.fax !== undefined ? String(patch.fax).trim() : p.fax,
          updatedAt: new Date().toISOString(),
        }
      : p
  );
  saveEsidAgentStore({ ...store, profiles });
  return profiles.find((p) => p.id === store.activeId)!;
}

export function switchOrCreateEsidAgent(name: string): EsidAgentProfile {
  const label = name.trim();
  if (!label) return getActiveEsidAgent();
  const store = loadEsidAgentStore();
  const existing = store.profiles.find((p) => p.name.toLowerCase() === label.toLowerCase());
  if (existing) {
    saveEsidAgentStore({ ...store, activeId: existing.id });
    return existing;
  }
  const created = createEmptyAgent(label);
  saveEsidAgentStore({
    version: 1,
    activeId: created.id,
    profiles: [...store.profiles, created],
  });
  return created;
}

export function setActiveEsidAgentId(id: string): EsidAgentProfile {
  const store = loadEsidAgentStore();
  if (!store.profiles.some((p) => p.id === id)) return getActiveEsidAgent();
  saveEsidAgentStore({ ...store, activeId: id });
  return store.profiles.find((p) => p.id === id)!;
}

/** Agent tối thiểu cần tên (để chọn combobox TCS). */
export function agentIsComplete(p: Pick<EsidAgentProfile, "name">): boolean {
  return Boolean(p.name.trim());
}
