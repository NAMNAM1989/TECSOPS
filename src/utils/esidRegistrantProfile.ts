/**
 * Hồ sơ người khai ESID (CCCD / họ tên / SĐT).
 * Store dùng chung factory với Agent.
 * Normalize: `shared/esidProfilesNormalize.mjs`.
 */
import {
  emptyEsidRegistrantStore,
  esidRegistrantStoreHasUserData as sharedRegistrantStoreHasUserData,
  normalizeEsidRegistrantStoreLoose,
} from "../../shared/esidProfilesNormalize.mjs";
import { createEsidProfileStoreApi } from "./esidProfileStoreFactory";

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

export type EsidRegistrantPatch = Partial<Pick<EsidRegistrantProfile, "name" | "tel" | "cccd">>;

const STORAGE_KEY = "tecsops-esid-registrant-v1";
export const ESID_REGISTRANT_CHANGED_EVENT = "tecsops-esid-registrant-changed";

const api = createEsidProfileStoreApi<EsidRegistrantProfile, EsidRegistrantPatch>({
  storageKey: STORAGE_KEY,
  changedEvent: ESID_REGISTRANT_CHANGED_EVENT,
  idPrefix: "reg",
  createEmpty: (name, newId) => ({
    id: newId(),
    name: name.trim(),
    tel: "",
    cccd: "",
    updatedAt: new Date().toISOString(),
  }),
  normalizeProfile: (raw, newId) => {
    const p = raw as Partial<EsidRegistrantProfile>;
    return {
      id: String(p.id || newId()),
      name: String(p.name || "").trim(),
      tel: String(p.tel || "").trim(),
      cccd: String(p.cccd || "").replace(/\s+/g, "").trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    };
  },
  profileHasUserData: (p) => Boolean(p.name.trim() || p.tel.trim() || p.cccd.trim()),
  mergePatch: (current, patch) => ({
    ...current,
    name: patch.name !== undefined ? String(patch.name).trim() : current.name,
    tel: patch.tel !== undefined ? String(patch.tel).trim() : current.tel,
    cccd:
      patch.cccd !== undefined ? String(patch.cccd).replace(/\s+/g, "").trim() : current.cccd,
  }),
  emptyStore: () => emptyEsidRegistrantStore() as EsidRegistrantStoreV1,
  normalizeStore: (raw) => normalizeEsidRegistrantStoreLoose(raw) as EsidRegistrantStoreV1,
  storeHasUserData: (store) => sharedRegistrantStoreHasUserData(store),
});

export const createEmptyRegistrant = api.createEmpty;
export const emptyRegistrantStore = api.emptyStore;
export const normalizeEsidRegistrantStore = api.normalizeStore;
export const esidRegistrantStoreHasUserData = api.storeHasUserData;
export const loadEsidRegistrantStore = api.loadStore;
export const saveEsidRegistrantStore = api.saveStore;
export const getActiveEsidRegistrant = api.getActive;
export const updateActiveEsidRegistrant = api.updateActive;
export const switchOrCreateEsidRegistrant = api.switchOrCreate;
export const setActiveEsidRegistrantId = api.setActiveId;

export function registrantIsComplete(
  p: Pick<EsidRegistrantProfile, "name" | "tel" | "cccd">
): boolean {
  return Boolean(p.name.trim() && p.tel.trim() && p.cccd.trim());
}
