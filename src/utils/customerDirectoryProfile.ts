import type {
  CustomerDirectoryEntry,
  CustomerParty,
  CustomerPartyType,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import { normalizeCustomerType, parseDefaultRate } from "./customerAccountFields";
import { normalizePrintAddressMultiline } from "./printAddressMultiline";
import { normalizeCustomerShortCode } from "./customerCodeOps";

/** Giới hạn độ dài — đồng bộ client / server. */
export const CUSTOMER_PROFILE_LIMITS = {
  code: 40,
  name: 200,
  shortCode: 10,
  shipperName: 120,
  shipperAddress: 300,
  shipperPhone: 40,
  shipperEmail: 120,
  taxCode: 40,
  consigneeName: 120,
  consigneeAddress: 300,
  consigneePhone: 40,
  consigneeEmail: 120,
  notifyName: 160,
  partyLabel: 80,
  partyContent: 8000,
  partyCount: 60,
  savedConsigneeLabel: 80,
  savedConsigneeCount: 40,
  savedGoodsLabel: 80,
  savedGoodsDescription: 120,
  savedGoodsCount: 40,
  savedShipperLabel: 80,
  savedShipperCount: 40,
  savedVehicleLabel: 80,
  savedVehicleLicensePlate: 20,
  savedVehicleDriverName: 120,
  savedVehicleDriverId: 20,
  savedVehicleCount: 30,
  otherRequirementsPrint: 200,
  address: 300,
  email: 120,
  phone: 40,
} as const;

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

export function clampCustomerSavedVehicle(v: CustomerSavedVehicle): CustomerSavedVehicle {
  const L = CUSTOMER_PROFILE_LIMITS;
  return {
    id: clip(v.id, 80).trim() || newSavedVehicleId(),
    licensePlate: clip(v.licensePlate, L.savedVehicleLicensePlate)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9;]/g, ""),
    driverName: clip(v.driverName, L.savedVehicleDriverName).trim(),
    driverId: clip(v.driverId, L.savedVehicleDriverId)
      .trim()
      .replace(/\D/g, ""),
  };
}

export function emptyCustomerSavedVehicle(): CustomerSavedVehicle {
  return clampCustomerSavedVehicle({
    id: newSavedVehicleId(),
    licensePlate: "",
    driverName: "",
    driverId: "",
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
  const shipperIds = new Set(savedShippers.map((x) => x.id));
  const cneeIds = new Set(savedConsignees.map((x) => x.id));
  const goodsIds = new Set(savedGoods.map((x) => x.id));
  const vehicleIds = new Set(savedVehicles.map((x) => x.id));
  let defaultShipperId = clip(migrated.defaultShipperId, 80).trim();
  let defaultConsigneeId = clip(migrated.defaultConsigneeId, 80).trim();
  let defaultGoodsId = clip(migrated.defaultGoodsId, 80).trim();
  let defaultVehicleId = clip(migrated.defaultVehicleId, 80).trim();
  if (defaultShipperId && !shipperIds.has(defaultShipperId)) defaultShipperId = "";
  if (defaultConsigneeId && !cneeIds.has(defaultConsigneeId)) defaultConsigneeId = "";
  if (defaultGoodsId && !goodsIds.has(defaultGoodsId)) defaultGoodsId = "";
  if (defaultVehicleId && !vehicleIds.has(defaultVehicleId)) defaultVehicleId = "";
  if (savedShippers.length === 1) defaultShipperId = savedShippers[0]!.id;
  if (savedConsignees.length === 1) defaultConsigneeId = savedConsignees[0]!.id;
  if (savedGoods.length === 1) defaultGoodsId = savedGoods[0]!.id;
  if (savedVehicles.length === 1) defaultVehicleId = savedVehicles[0]!.id;
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
    savedShippers,
    savedConsignees,
    savedGoods,
    savedVehicles,
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
    parties: [],
  };
}

/** Dòng sidebar: Short Code ưu tiên, fallback Code. */
export function customerDirectoryListCode(e: CustomerDirectoryEntry): string {
  return (e.shortCode?.trim() || e.code.trim() || "—").toUpperCase();
}
