import type {
  CustomerDirectoryEntry,
  CustomerParty,
  CustomerPartyType,
  CustomerSavedConsignee,
  CustomerSavedDimTemplate,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import { normalizeCustomerType, parseDefaultRate } from "./customerAccountFields";
import { normalizePrintAddressMultiline } from "./printAddressMultiline";
import { normalizeCustomerShortCode } from "./customerCodeOps";

import { CUSTOMER_PROFILE_LIMITS } from "../../shared/customerProfileLimits.mjs";
import { normalizeVehiclePlateInput } from "./vehiclePlateNormalize";

/** Re-export — nguồn sự thật: `shared/customerProfileLimits.mjs`. */
export { CUSTOMER_PROFILE_LIMITS };

function clip(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

function fallbackPartyId(prefix = "party"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCustomerPartyType(value: unknown): CustomerPartyType {
  const raw = String(value ?? "").trim().toUpperCase();
  return raw === "SHIPPER" || raw === "CNEE" || raw === "NOTIFY" || raw === "OTHER" ? raw : "OTHER";
}

function newSavedConsigneeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cnee-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampCustomerSavedConsignee(c: CustomerSavedConsignee): CustomerSavedConsignee {
  const L = CUSTOMER_PROFILE_LIMITS;
  return {
    id: clip(c.id, 80).trim() || newSavedConsigneeId(),
    label: clip(c.label, L.savedConsigneeLabel).trim(),
    consigneeName: clip(c.consigneeName, L.consigneeName).trim(),
    consigneeAddress: normalizePrintAddressMultiline(
      clip(c.consigneeAddress, L.consigneeAddress),
      6
    ).slice(0, L.consigneeAddress),
    consigneePhone: clip(c.consigneePhone, L.consigneePhone).trim(),
    consigneeEmail: clip(c.consigneeEmail, L.consigneeEmail).trim(),
    notifyName: clip(c.notifyName, L.notifyName).trim(),
  };
}

export function emptyCustomerSavedConsignee(): CustomerSavedConsignee {
  return clampCustomerSavedConsignee({
    id: newSavedConsigneeId(),
    label: "",
    consigneeName: "",
    consigneeAddress: "",
    consigneePhone: "",
    consigneeEmail: "",
    notifyName: "",
  });
}

function newSavedGoodsId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `goods-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampCustomerSavedGoods(g: CustomerSavedGoods): CustomerSavedGoods {
  const L = CUSTOMER_PROFILE_LIMITS;
  return {
    id: clip(g.id, 80).trim() || newSavedGoodsId(),
    label: clip(g.label, L.savedGoodsLabel).trim(),
    goodsDescription: clip(g.goodsDescription, L.savedGoodsDescription).trim(),
  };
}

export function emptyCustomerSavedGoods(): CustomerSavedGoods {
  return clampCustomerSavedGoods({
    id: newSavedGoodsId(),
    label: "",
    goodsDescription: "",
  });
}

function newSavedShipperId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shipper-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampCustomerSavedShipper(s: CustomerSavedShipper): CustomerSavedShipper {
  const L = CUSTOMER_PROFILE_LIMITS;
  return {
    id: clip(s.id, 80).trim() || newSavedShipperId(),
    label: clip(s.label, L.savedShipperLabel).trim(),
    shipperName: clip(s.shipperName, L.shipperName).trim(),
    shipperAddress: normalizePrintAddressMultiline(
      clip(s.shipperAddress, L.shipperAddress),
      6
    ).slice(0, L.shipperAddress),
    shipperPhone: clip(s.shipperPhone, L.shipperPhone).trim(),
    shipperEmail: clip(s.shipperEmail, L.shipperEmail).trim(),
    taxCode: clip(s.taxCode, L.taxCode).trim(),
  };
}

export function emptyCustomerSavedShipper(): CustomerSavedShipper {
  return clampCustomerSavedShipper({
    id: newSavedShipperId(),
    label: "",
    shipperName: "",
    shipperAddress: "",
    shipperPhone: "",
    shipperEmail: "",
    taxCode: "",
  });
}

function newSavedVehicleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSavedVehicleType(
  raw: unknown
): CustomerSavedVehicle["vehicleType"] | undefined {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "OTO" || u === "XEMAY" || u === "BAGAC" || u === "DIBO") return u;
  return undefined;
}

function normalizeSavedDriverIdType(
  raw: unknown
): CustomerSavedVehicle["driverIdType"] | undefined {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "PASSPORT" || u === "PP") return "PP";
  if (u === "CCCD" || u === "GPLX") return u;
  return undefined;
}

export function clampCustomerSavedVehicle(v: CustomerSavedVehicle): CustomerSavedVehicle {
  const L = CUSTOMER_PROFILE_LIMITS;
  const label = clip(v.label, L.savedVehicleLabel).trim();
  const vehicleType = normalizeSavedVehicleType(v.vehicleType);
  const driverIdType = normalizeSavedDriverIdType(v.driverIdType);
  const driverIdRaw = clip(v.driverId, L.savedVehicleDriverId).trim();
  const driverId =
    driverIdType && driverIdType !== "CCCD"
      ? driverIdRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
      : driverIdRaw.replace(/\D/g, "");
  return {
    id: clip(v.id, 80).trim() || newSavedVehicleId(),
    ...(label ? { label } : {}),
    licensePlate: clip(
      normalizeVehiclePlateInput(v.licensePlate),
      L.savedVehicleLicensePlate
    ),
    driverName: clip(v.driverName, L.savedVehicleDriverName).trim(),
    driverId,
    ...(driverIdType ? { driverIdType } : {}),
    ...(vehicleType ? { vehicleType } : {}),
  };
}

export function emptyCustomerSavedVehicle(): CustomerSavedVehicle {
  return clampCustomerSavedVehicle({
    id: newSavedVehicleId(),
    licensePlate: "",
    driverName: "",
    driverId: "",
    driverIdType: "CCCD",
    vehicleType: "OTO",
  });
}

function newSavedDimTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dimtmpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampCustomerSavedDimTemplate(t: CustomerSavedDimTemplate): CustomerSavedDimTemplate {
  const L = CUSTOMER_PROFILE_LIMITS;
  const lCm = Number.isFinite(t.lCm) && t.lCm > 0 ? Math.round(t.lCm) : 30;
  const wCm = Number.isFinite(t.wCm) && t.wCm > 0 ? Math.round(t.wCm) : 20;
  const hCm = Number.isFinite(t.hCm) && t.hCm > 0 ? Math.round(t.hCm) : 20;
  const stdPcsKg =
    t.stdPcsKg != null && Number.isFinite(t.stdPcsKg) && t.stdPcsKg > 0
      ? Math.round(t.stdPcsKg * 100) / 100
      : undefined;
  return {
    id: clip(t.id, 80).trim() || newSavedDimTemplateId(),
    label: clip(t.label, L.savedDimTemplateLabel).trim() || `${lCm}×${wCm}×${hCm}`,
    lCm,
    wCm,
    hCm,
    ...(stdPcsKg != null ? { stdPcsKg } : {}),
    ...(t.isDefault ? { isDefault: true } : {}),
  };
}

export function emptyCustomerSavedDimTemplate(): CustomerSavedDimTemplate {
  return clampCustomerSavedDimTemplate({
    id: newSavedDimTemplateId(),
    label: "",
    lCm: 40,
    wCm: 30,
    hCm: 25,
  });
}


type LegacyCustomerRow = CustomerDirectoryEntry & {
  consigneeName?: string;
  consigneeAddress?: string;
  consigneePhone?: string;
  consigneeEmail?: string;
  notifyName?: string;
};

/** Đưa shipper/CNEE đơn (cũ) vào danh sách lưu sẵn nếu chưa có mục nào. */
function migrateLegacyPrintProfiles(e: LegacyCustomerRow): CustomerDirectoryEntry {
  let savedShippers = Array.isArray(e.savedShippers) ? [...e.savedShippers] : [];
  let savedConsignees = Array.isArray(e.savedConsignees) ? [...e.savedConsignees] : [];
  const savedGoods = Array.isArray(e.savedGoods) ? [...e.savedGoods] : [];

  if (
    savedShippers.length === 0 &&
    (e.shipperName?.trim() ||
      e.shipperAddress?.trim() ||
      e.shipperPhone?.trim() ||
      e.shipperEmail?.trim() ||
      e.taxCode?.trim())
  ) {
    savedShippers = [
      clampCustomerSavedShipper({
        id: newSavedShipperId(),
        label: "Mặc định",
        shipperName: e.shipperName ?? "",
        shipperAddress: e.shipperAddress ?? "",
        shipperPhone: e.shipperPhone ?? "",
        shipperEmail: e.shipperEmail ?? "",
        taxCode: e.taxCode ?? "",
      }),
    ];
  }

  if (
    savedConsignees.length === 0 &&
    (e.consigneeName?.trim() ||
      e.consigneeAddress?.trim() ||
      e.consigneePhone?.trim() ||
      e.consigneeEmail?.trim() ||
      e.notifyName?.trim())
  ) {
    savedConsignees = [
      clampCustomerSavedConsignee({
        id: newSavedConsigneeId(),
        label: "Mặc định",
        consigneeName: e.consigneeName ?? "",
        consigneeAddress: e.consigneeAddress ?? "",
        consigneePhone: e.consigneePhone ?? "",
        consigneeEmail: e.consigneeEmail ?? "",
        notifyName: e.notifyName ?? "",
      }),
    ];
  }

  return { ...e, savedShippers, savedConsignees, savedGoods };
}

export function clampCustomerParty(p: CustomerParty): CustomerParty {
  const L = CUSTOMER_PROFILE_LIMITS;
  return {
    id: clip(p.id, 80).trim() || fallbackPartyId(),
    type: normalizeCustomerPartyType(p.type),
    label: clip(p.label, L.partyLabel).trim(),
    content: clip(p.content, L.partyContent),
  };
}

/** Chuẩn hóa một dòng danh bạ trước khi lưu / sau khi parse lỏng. */
export function clampCustomerDirectoryEntry(e: CustomerDirectoryEntry): CustomerDirectoryEntry {
  const migrated = migrateLegacyPrintProfiles(e as LegacyCustomerRow);
  const L = CUSTOMER_PROFILE_LIMITS;
  const parties = Array.isArray(migrated.parties)
    ? migrated.parties
        .slice(0, L.partyCount)
        .map(clampCustomerParty)
        .filter((p) => p.label || p.content.trim())
    : [];
  const savedShippers = Array.isArray(migrated.savedShippers)
    ? migrated.savedShippers
        .slice(0, L.savedShipperCount)
        .map((x) => clampCustomerSavedShipper(x as CustomerSavedShipper))
        .filter((x) => x.shipperName || x.label || x.shipperAddress || x.shipperPhone || x.shipperEmail || x.taxCode)
    : [];
  const savedConsignees = Array.isArray(migrated.savedConsignees)
    ? migrated.savedConsignees
        .slice(0, L.savedConsigneeCount)
        .map((x) => clampCustomerSavedConsignee(x as CustomerSavedConsignee))
        .filter((x) => x.consigneeName || x.label || x.consigneeAddress || x.consigneePhone || x.consigneeEmail || x.notifyName)
    : [];
  const savedGoods = Array.isArray(migrated.savedGoods)
    ? migrated.savedGoods
        .slice(0, L.savedGoodsCount)
        .map((x) => clampCustomerSavedGoods(x as CustomerSavedGoods))
        .filter((x) => x.goodsDescription || x.label)
    : [];
  const savedVehicles = Array.isArray(migrated.savedVehicles)
    ? migrated.savedVehicles
        .slice(0, L.savedVehicleCount)
        .map((x) => clampCustomerSavedVehicle(x as CustomerSavedVehicle))
        .filter((x) => x.licensePlate || x.driverName || x.driverId)
    : [];
  const savedDimTemplates = Array.isArray(migrated.savedDimTemplates)
    ? migrated.savedDimTemplates
        .slice(0, L.savedDimTemplateCount)
        .map((x) => clampCustomerSavedDimTemplate(x as CustomerSavedDimTemplate))
        .filter((x) => x.label && x.lCm > 0 && x.wCm > 0 && x.hCm > 0)
    : [];
  const shipperIds = new Set(savedShippers.map((x) => x.id));
  const cneeIds = new Set(savedConsignees.map((x) => x.id));
  const goodsIds = new Set(savedGoods.map((x) => x.id));
  const vehicleIds = new Set(savedVehicles.map((x) => x.id));
  const dimTmplIds = new Set(savedDimTemplates.map((x) => x.id));
  let defaultShipperId = clip(migrated.defaultShipperId, 80).trim();
  let defaultConsigneeId = clip(migrated.defaultConsigneeId, 80).trim();
  let defaultGoodsId = clip(migrated.defaultGoodsId, 80).trim();
  let defaultVehicleId = clip(migrated.defaultVehicleId, 80).trim();
  let defaultDimTemplateId = clip(migrated.defaultDimTemplateId, 80).trim();
  if (defaultShipperId && !shipperIds.has(defaultShipperId)) defaultShipperId = "";
  if (defaultConsigneeId && !cneeIds.has(defaultConsigneeId)) defaultConsigneeId = "";
  if (defaultGoodsId && !goodsIds.has(defaultGoodsId)) defaultGoodsId = "";
  if (defaultVehicleId && !vehicleIds.has(defaultVehicleId)) defaultVehicleId = "";
  if (defaultDimTemplateId && !dimTmplIds.has(defaultDimTemplateId)) defaultDimTemplateId = "";
  if (savedShippers.length === 1) defaultShipperId = savedShippers[0]!.id;
  if (savedConsignees.length === 1) defaultConsigneeId = savedConsignees[0]!.id;
  if (savedGoods.length === 1) defaultGoodsId = savedGoods[0]!.id;
  if (savedVehicles.length === 1) defaultVehicleId = savedVehicles[0]!.id;
  if (savedDimTemplates.length === 1) defaultDimTemplateId = savedDimTemplates[0]!.id;
  const code = clip(migrated.code, L.code).trim();
  const shortCode = normalizeCustomerShortCode(clip(migrated.shortCode, L.shortCode)) || undefined;
  const taxCode = clip(migrated.taxCode, L.taxCode).trim() || undefined;
  const address = clip(migrated.address, L.address).trim() || undefined;
  const email = clip(migrated.email, L.email).trim() || undefined;
  const phone = clip(migrated.phone, L.phone).trim() || undefined;
  const defaultRate = parseDefaultRate(migrated.defaultRate);
  const rawType = String(migrated.customerType ?? "").trim();
  const customerType = rawType ? normalizeCustomerType(rawType) : undefined;
  return {
    id: clip(migrated.id, 80).trim(),
    code,
    name: clip(migrated.name, L.name).trim(),
    ...(shortCode ? { shortCode } : {}),
    ...(taxCode ? { taxCode } : {}),
    ...(address ? { address } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(defaultRate != null ? { defaultRate } : {}),
    ...(customerType ? { customerType } : {}),
    defaultShipperId: defaultShipperId || undefined,
    defaultConsigneeId: defaultConsigneeId || undefined,
    defaultGoodsId: defaultGoodsId || undefined,
    defaultVehicleId: defaultVehicleId || undefined,
    defaultDimTemplateId: defaultDimTemplateId || undefined,
    savedShippers,
    savedConsignees,
    savedGoods,
    savedVehicles,
    savedDimTemplates,
    otherRequirementsPrint: clip(migrated.otherRequirementsPrint, L.otherRequirementsPrint).trim() || undefined,
    parties,
  };

}

/** Một dòng trống cho form thêm mới. */
export function emptyCustomerProfileRow(id: string): CustomerDirectoryEntry {
  return {
    id,
    code: "",
    name: "",
    shortCode: "",
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [],
    savedDimTemplates: [],
    parties: [],
  };
}

/** Dòng sidebar: Short Code ưu tiên, fallback Code. */
export function customerDirectoryListCode(e: CustomerDirectoryEntry): string {
  return (e.shortCode?.trim() || e.code.trim() || "—").toUpperCase();
}
