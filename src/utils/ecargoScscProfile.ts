/**
 * Hồ sơ đại lý eCargo SCSC — nhập 1 lần, lưu local + sync server.
 * Store dùng chung factory với ESID profiles.
 */
import {
  emptyEcargoScscStore,
  ecargoScscProfileIsComplete as sharedProfileIsComplete,
  ecargoScscStoreHasUserData as sharedStoreHasUserData,
  normalizeEcargoArrivalSlot,
  normalizeEcargoIdType,
  normalizeEcargoScscStoreLoose,
  normalizeEcargoVehicleType,
} from "../../shared/ecargoScscProfilesNormalize.mjs";
import { createEsidProfileStoreApi } from "./esidProfileStoreFactory";
import { normalizeEcargoIdNumber, normalizeEcargoPersonName } from "./ecargoTextNormalize";

export type EcargoIdType = "CCCD" | "PP" | "GPLX";
export type EcargoVehicleType = "OTO" | "XEMAY" | "BAGAC" | "DIBO";

export type EcargoScscProfile = {
  id: string;
  /** Tên đại lý hiện trên phiếu eCargo — điền nguyên văn từ hồ sơ (không bắt buộc có trong list Agent). */
  name: string;
  /** AgentIdent eCargo (số) — gắn tay nếu biết, bỏ qua autocomplete. */
  agentIdent?: string;
  /** AgentCode eCargo (VD NNL). */
  agentCode?: string;
  agentPicName: string;
  agentPicIdType: EcargoIdType;
  agentPicId: string;
  email: string;
  mobilePhone: string;
  /** "0".."23" — khung giờ hàng vào. */
  defaultArrivalSlot: string;
  defaultVehicleType: EcargoVehicleType;
  updatedAt: string;
};

export type EcargoScscStoreV1 = {
  version: 1;
  activeId: string;
  profiles: EcargoScscProfile[];
};

export type EcargoScscPatch = Partial<
  Pick<
    EcargoScscProfile,
    | "name"
    | "agentIdent"
    | "agentCode"
    | "agentPicName"
    | "agentPicIdType"
    | "agentPicId"
    | "email"
    | "mobilePhone"
    | "defaultArrivalSlot"
    | "defaultVehicleType"
  >
>;

const STORAGE_KEY = "tecsops-ecargo-scsc-v1";
export const ECARGO_SCSC_CHANGED_EVENT = "tecsops-ecargo-scsc-changed";

const api = createEsidProfileStoreApi<EcargoScscProfile, EcargoScscPatch>({
  storageKey: STORAGE_KEY,
  changedEvent: ECARGO_SCSC_CHANGED_EVENT,
  idPrefix: "ecargo",
  createEmpty: (name, newId) => ({
    id: newId(),
    name: name.trim(),
    agentIdent: "",
    agentCode: "",
    agentPicName: "",
    agentPicIdType: "CCCD",
    agentPicId: "",
    email: "",
    mobilePhone: "",
    defaultArrivalSlot: "8",
    defaultVehicleType: "OTO",
    updatedAt: new Date().toISOString(),
  }),
  normalizeProfile: (raw, newId) => {
    const p = raw as Partial<EcargoScscProfile>;
    return {
      id: String(p.id || newId()),
      name: String(p.name || "").trim(),
      agentIdent: String(p.agentIdent || "")
        .replace(/\D/g, "")
        .trim(),
      agentCode: String(p.agentCode || "")
        .trim()
        .toUpperCase(),
      agentPicName: String(p.agentPicName || "").trim(),
      agentPicIdType: normalizeEcargoIdType(p.agentPicIdType) as EcargoIdType,
      agentPicId: String(p.agentPicId || "")
        .replace(/\s+/g, "")
        .trim(),
      email: String(p.email || "").trim(),
      mobilePhone: String(p.mobilePhone || "")
        .replace(/\s+/g, "")
        .trim(),
      defaultArrivalSlot: normalizeEcargoArrivalSlot(p.defaultArrivalSlot),
      defaultVehicleType: normalizeEcargoVehicleType(p.defaultVehicleType) as EcargoVehicleType,
      updatedAt: String(p.updatedAt || new Date().toISOString()),
    };
  },
  profileHasUserData: (p) =>
    Boolean(
      p.name.trim() ||
        p.agentPicName.trim() ||
        p.agentPicId.trim() ||
        p.email.trim() ||
        p.mobilePhone.trim()
    ),
  mergePatch: (current, patch) => ({
    ...current,
    name: patch.name !== undefined ? String(patch.name).trim() : current.name,
    agentIdent:
      patch.agentIdent !== undefined
        ? String(patch.agentIdent).replace(/\D/g, "").trim()
        : current.agentIdent || "",
    agentCode:
      patch.agentCode !== undefined
        ? String(patch.agentCode).trim().toUpperCase()
        : current.agentCode || "",
    agentPicName:
      patch.agentPicName !== undefined
        ? String(patch.agentPicName).trim()
        : current.agentPicName,
    agentPicIdType:
      patch.agentPicIdType !== undefined
        ? (normalizeEcargoIdType(patch.agentPicIdType) as EcargoIdType)
        : current.agentPicIdType,
    agentPicId:
      patch.agentPicId !== undefined
        ? String(patch.agentPicId).replace(/\s+/g, "").trim()
        : current.agentPicId,
    email: patch.email !== undefined ? String(patch.email).trim() : current.email,
    mobilePhone:
      patch.mobilePhone !== undefined
        ? String(patch.mobilePhone).replace(/\s+/g, "").trim()
        : current.mobilePhone,
    defaultArrivalSlot:
      patch.defaultArrivalSlot !== undefined
        ? normalizeEcargoArrivalSlot(patch.defaultArrivalSlot)
        : current.defaultArrivalSlot,
    defaultVehicleType:
      patch.defaultVehicleType !== undefined
        ? (normalizeEcargoVehicleType(patch.defaultVehicleType) as EcargoVehicleType)
        : current.defaultVehicleType,
  }),
  emptyStore: () => emptyEcargoScscStore() as EcargoScscStoreV1,
  normalizeStore: (raw) => normalizeEcargoScscStoreLoose(raw) as EcargoScscStoreV1,
  storeHasUserData: (store) => sharedStoreHasUserData(store),
});

export const emptyEcargoStore = api.emptyStore;
export const normalizeEcargoScscStore = api.normalizeStore;
export const ecargoScscStoreHasUserData = api.storeHasUserData;
export const loadEcargoScscStore = api.loadStore;
export const saveEcargoScscStore = api.saveStore;
export const getActiveEcargoScscProfile = api.getActive;
export const updateActiveEcargoScscProfile = api.updateActive;
export const switchOrCreateEcargoScscProfile = api.switchOrCreate;
export const setActiveEcargoScscProfileId = api.setActiveId;

export function ecargoScscProfileIsComplete(
  p: Pick<
    EcargoScscProfile,
    "name" | "agentPicName" | "agentPicId" | "email" | "mobilePhone"
  >
): boolean {
  return sharedProfileIsComplete(p);
}

/** Chuẩn hóa họ tên / CCCD trước khi gửi extension. */
export function prepareEcargoProfileForFill(p: EcargoScscProfile): EcargoScscProfile {
  return {
    ...p,
    name: p.name.trim(),
    agentIdent: String(p.agentIdent || "")
      .replace(/\D/g, "")
      .trim(),
    agentCode: String(p.agentCode || "")
      .trim()
      .toUpperCase(),
    agentPicName: normalizeEcargoPersonName(p.agentPicName),
    agentPicId: normalizeEcargoIdNumber(p.agentPicId),
    email: p.email.trim(),
    mobilePhone: p.mobilePhone.replace(/\s+/g, "").trim(),
  };
}
