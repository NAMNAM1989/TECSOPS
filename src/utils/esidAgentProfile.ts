/**
 * Hồ sơ Agent ESID — store dùng chung factory với Người khai.
 * Điền form TCS từ hồ sơ này — không lấy agent theo từng lô.
 * Normalize: `shared/esidProfilesNormalize.mjs`.
 */
import {
  emptyEsidAgentStore,
  esidAgentStoreHasUserData as sharedAgentStoreHasUserData,
  normalizeEsidAgentStoreLoose,
} from "../../shared/esidProfilesNormalize.mjs";
import { createEsidProfileStoreApi } from "./esidProfileStoreFactory";

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

export type EsidAgentPatch = Partial<
  Pick<EsidAgentProfile, "name" | "address" | "tel" | "email" | "vat" | "fax">
>;

const STORAGE_KEY = "tecsops-esid-agent-v1";
export const ESID_AGENT_CHANGED_EVENT = "tecsops-esid-agent-changed";

const api = createEsidProfileStoreApi<EsidAgentProfile, EsidAgentPatch>({
  storageKey: STORAGE_KEY,
  changedEvent: ESID_AGENT_CHANGED_EVENT,
  idPrefix: "agt",
  createEmpty: (name, newId) => ({
    id: newId(),
    name: name.trim(),
    address: "",
    tel: "",
    email: "",
    vat: "",
    fax: "",
    updatedAt: new Date().toISOString(),
  }),
  normalizeProfile: (raw, newId) => {
    const p = raw as Partial<EsidAgentProfile>;
    return {
      id: String(p.id || newId()),
      name: String(p.name || "").trim(),
      address: String(p.address || "").trim(),
      tel: String(p.tel || "").trim(),
      email: String(p.email || "").trim(),
      vat: String(p.vat || "").trim(),
      fax: String(p.fax || "").trim(),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    };
  },
  profileHasUserData: (p) =>
    Boolean(p.name.trim() || p.address.trim() || p.tel.trim() || p.email.trim() || p.vat.trim()),
  mergePatch: (current, patch) => ({
    ...current,
    name: patch.name !== undefined ? String(patch.name).trim() : current.name,
    address: patch.address !== undefined ? String(patch.address).trim() : current.address,
    tel: patch.tel !== undefined ? String(patch.tel).trim() : current.tel,
    email: patch.email !== undefined ? String(patch.email).trim() : current.email,
    vat: patch.vat !== undefined ? String(patch.vat).trim() : current.vat,
    fax: patch.fax !== undefined ? String(patch.fax).trim() : current.fax,
  }),
  emptyStore: () => emptyEsidAgentStore() as EsidAgentStoreV1,
  normalizeStore: (raw) => normalizeEsidAgentStoreLoose(raw) as EsidAgentStoreV1,
  storeHasUserData: (store) => sharedAgentStoreHasUserData(store),
});

export const emptyAgentStore = api.emptyStore;
export const normalizeEsidAgentStore = api.normalizeStore;
export const esidAgentStoreHasUserData = api.storeHasUserData;
export const loadEsidAgentStore = api.loadStore;
export const saveEsidAgentStore = api.saveStore;
export const getActiveEsidAgent = api.getActive;
export const updateActiveEsidAgent = api.updateActive;
export const switchOrCreateEsidAgent = api.switchOrCreate;
export const setActiveEsidAgentId = api.setActiveId;

/** Agent tối thiểu cần tên (để chọn combobox TCS). */
export function agentIsComplete(p: Pick<EsidAgentProfile, "name">): boolean {
  return Boolean(p.name.trim());
}
