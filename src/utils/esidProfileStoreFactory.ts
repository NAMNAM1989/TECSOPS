/**
 * Factory store hồ sơ ESID (Agent / Người khai) — tránh nhân đôi load/save/normalize.
 */

export type EsidProfileBase = {
  id: string;
  name: string;
  updatedAt: string;
};

export type EsidProfileStoreV1<P extends EsidProfileBase> = {
  version: 1;
  activeId: string;
  profiles: P[];
};

export type EsidProfileStoreConfig<P extends EsidProfileBase, Patch = Partial<P>> = {
  storageKey: string;
  changedEvent: string;
  idPrefix: string;
  createEmpty: (name: string, newId: () => string) => P;
  normalizeProfile: (raw: unknown, newId: () => string) => P;
  profileHasUserData: (p: P) => boolean;
  /** Merge patch vào hồ sơ active (trim / normalize field). */
  mergePatch: (current: P, patch: Patch) => P;
  /** Override — dùng shared normalize (Agent/Registrant). */
  emptyStore?: () => EsidProfileStoreV1<P>;
  normalizeStore?: (raw: unknown) => EsidProfileStoreV1<P>;
  storeHasUserData?: (store: EsidProfileStoreV1<P>) => boolean;
};

function makeNewId(prefix: string): () => string {
  return () => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEsidProfileStoreApi<P extends EsidProfileBase, Patch = Partial<P>>(
  config: EsidProfileStoreConfig<P, Patch>
) {
  const newId = makeNewId(config.idPrefix);

  function notifyChanged(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(config.changedEvent));
  }

  function createEmpty(name = ""): P {
    return config.createEmpty(name, newId);
  }

  function emptyStore(): EsidProfileStoreV1<P> {
    if (config.emptyStore) return config.emptyStore();
    const p = createEmpty("");
    return { version: 1, activeId: p.id, profiles: [p] };
  }

  function normalizeStore(raw: unknown): EsidProfileStoreV1<P> {
    if (config.normalizeStore) return config.normalizeStore(raw);
    if (!raw || typeof raw !== "object") return emptyStore();
    const o = raw as EsidProfileStoreV1<P>;
    if (o.version !== 1 || !Array.isArray(o.profiles)) return emptyStore();
    const profiles = o.profiles
      .filter((p) => p && typeof p === "object")
      .map((p) => config.normalizeProfile(p, newId));
    if (!profiles.length) return emptyStore();
    const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
    return { version: 1, activeId, profiles };
  }

  function storeHasUserData(store: EsidProfileStoreV1<P>): boolean {
    if (config.storeHasUserData) return config.storeHasUserData(store);
    return store.profiles.some((p) => config.profileHasUserData(p));
  }

  function loadStore(): EsidProfileStoreV1<P> {
    try {
      const parsed = normalizeStore(JSON.parse(localStorage.getItem(config.storageKey) || "null"));
      if (storeHasUserData(parsed) || localStorage.getItem(config.storageKey)) {
        return parsed;
      }
    } catch {
      /* ignore */
    }
    const created = emptyStore();
    saveStore(created);
    return created;
  }

  function saveStore(store: EsidProfileStoreV1<P>): void {
    const next = normalizeStore(store);
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(next));
      notifyChanged();
    } catch {
      /* ignore */
    }
  }

  function getActive(): P {
    const store = loadStore();
    return store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
  }

  function updateActive(patch: Patch): P {
    const store = loadStore();
    const profiles = store.profiles.map((p) => {
      if (p.id !== store.activeId) return p;
      return {
        ...config.mergePatch(p, patch),
        id: p.id,
        updatedAt: new Date().toISOString(),
      };
    });
    saveStore({ ...store, profiles });
    return profiles.find((p) => p.id === store.activeId)!;
  }

  function switchOrCreate(name: string): P {
    const label = name.trim();
    if (!label) return getActive();
    const store = loadStore();
    const existing = store.profiles.find((p) => p.name.toLowerCase() === label.toLowerCase());
    if (existing) {
      saveStore({ ...store, activeId: existing.id });
      return existing;
    }
    const created = createEmpty(label);
    saveStore({
      version: 1,
      activeId: created.id,
      profiles: [...store.profiles, created],
    });
    return created;
  }

  function setActiveId(id: string): P {
    const store = loadStore();
    if (!store.profiles.some((p) => p.id === id)) return getActive();
    saveStore({ ...store, activeId: id });
    return store.profiles.find((p) => p.id === id)!;
  }

  return {
    changedEvent: config.changedEvent,
    createEmpty,
    emptyStore,
    normalizeStore,
    storeHasUserData,
    loadStore,
    saveStore,
    getActive,
    updateActive,
    switchOrCreate,
    setActiveId,
  };
}
