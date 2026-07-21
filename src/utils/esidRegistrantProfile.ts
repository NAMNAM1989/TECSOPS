/**
 * Hồ sơ người khai ESID (CCCD / họ tên / SĐT) — cố định trên máy Ops.
 * Đổi người khai = chọn hoặc thêm hồ sơ tên khác (không gắn theo từng lô).
 */
export type EsidRegistrantProfile = {
  id: string;
  /** Họ tên đầy đủ người gửi hàng / Shipper Fullname trên form TCS */
  name: string;
  tel: string;
  cccd: string;
  updatedAt: string;
};

export type EsidRegistrantStoreV1 = {
  version: 1;
  activeId: string;
  profiles: EsidRegistrantProfile[];
};

const STORAGE_KEY = "tecsops-esid-registrant-v1";
export const ESID_REGISTRANT_CHANGED_EVENT = "tecsops-esid-registrant-changed";

function notifyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ESID_REGISTRANT_CHANGED_EVENT));
}

function newId(): string {
  return `reg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyRegistrant(name = ""): EsidRegistrantProfile {
  return {
    id: newId(),
    name: name.trim(),
    tel: "",
    cccd: "",
    updatedAt: new Date().toISOString(),
  };
}

export function emptyRegistrantStore(): EsidRegistrantStoreV1 {
  const p = createEmptyRegistrant("");
  return { version: 1, activeId: p.id, profiles: [p] };
}

function normalizeStore(raw: unknown): EsidRegistrantStoreV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as EsidRegistrantStoreV1;
  if (o.version !== 1 || !Array.isArray(o.profiles)) return null;
  const profiles = o.profiles
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || newId()),
      name: String(p.name || "").trim(),
      tel: String(p.tel || "").trim(),
      cccd: String(p.cccd || "").replace(/\s+/g, "").trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    }));
  if (!profiles.length) return emptyRegistrantStore();
  const activeId = profiles.some((p) => p.id === o.activeId) ? o.activeId : profiles[0].id;
  return { version: 1, activeId, profiles };
}

export function loadEsidRegistrantStore(): EsidRegistrantStoreV1 {
  try {
    const parsed = normalizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    if (parsed) return parsed;
  } catch {
    /* ignore */
  }
  const created = emptyRegistrantStore();
  saveEsidRegistrantStore(created);
  return created;
}

export function saveEsidRegistrantStore(store: EsidRegistrantStoreV1): void {
  const next = normalizeStore(store) || emptyRegistrantStore();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyChanged();
  } catch {
    /* ignore */
  }
}

export function getActiveEsidRegistrant(): EsidRegistrantProfile {
  const store = loadEsidRegistrantStore();
  return store.profiles.find((p) => p.id === store.activeId) || store.profiles[0];
}

/** Cập nhật hồ sơ đang active (cùng CCCD/tên hiện tại). */
export function updateActiveEsidRegistrant(
  patch: Partial<Pick<EsidRegistrantProfile, "name" | "tel" | "cccd">>
): EsidRegistrantProfile {
  const store = loadEsidRegistrantStore();
  const profiles = store.profiles.map((p) =>
    p.id === store.activeId
      ? {
          ...p,
          name: patch.name !== undefined ? String(patch.name).trim() : p.name,
          tel: patch.tel !== undefined ? String(patch.tel).trim() : p.tel,
          cccd:
            patch.cccd !== undefined
              ? String(patch.cccd).replace(/\s+/g, "").trim()
              : p.cccd,
          updatedAt: new Date().toISOString(),
        }
      : p
  );
  saveEsidRegistrantStore({ ...store, profiles });
  return profiles.find((p) => p.id === store.activeId)!;
}

/**
 * Đổi người khai: tạo hồ sơ tên mới (hoặc kích hoạt nếu tên trùng, không phân biệt hoa thường).
 */
export function switchOrCreateEsidRegistrant(name: string): EsidRegistrantProfile {
  const label = name.trim();
  if (!label) return getActiveEsidRegistrant();
  const store = loadEsidRegistrantStore();
  const existing = store.profiles.find((p) => p.name.toLowerCase() === label.toLowerCase());
  if (existing) {
    saveEsidRegistrantStore({ ...store, activeId: existing.id });
    return existing;
  }
  const created = createEmptyRegistrant(label);
  saveEsidRegistrantStore({
    version: 1,
    activeId: created.id,
    profiles: [...store.profiles, created],
  });
  return created;
}

export function setActiveEsidRegistrantId(id: string): EsidRegistrantProfile {
  const store = loadEsidRegistrantStore();
  if (!store.profiles.some((p) => p.id === id)) return getActiveEsidRegistrant();
  saveEsidRegistrantStore({ ...store, activeId: id });
  return store.profiles.find((p) => p.id === id)!;
}

export function registrantIsComplete(p: Pick<EsidRegistrantProfile, "name" | "tel" | "cccd">): boolean {
  return Boolean(p.name.trim() && p.tel.trim() && p.cccd.trim());
}
