import type {
  CustomerDirectoryEntry,
  CustomerParty,
  CustomerPartyType,
  CustomerSavedVehicle,
} from "../types/customerDirectory";
import { validateCustomerDirectory } from "./customerDirectoryValidation";
import {
  clampCustomerDirectoryEntry,
  clampCustomerSavedConsignee,
  clampCustomerSavedDimTemplate,
  clampCustomerSavedGoods,
  clampCustomerSavedShipper,
  clampCustomerSavedVehicle,
  normalizeCustomerPartyType,
} from "./customerDirectoryProfile";
import { toSyncedAtIso } from "./dbSyncedAt";

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function partyTypeFromLabel(label: string): CustomerPartyType {
  const up = label.trim().toUpperCase();
  if (up.startsWith("SHIPPER")) return "SHIPPER";
  if (up.startsWith("CNEE") || up.startsWith("CONSIGNEE")) return "CNEE";
  if (up.startsWith("NOTIFY")) return "NOTIFY";
  return "OTHER";
}

function parsePartiesLoose(o: Record<string, unknown>): CustomerParty[] {
  if (Array.isArray(o.parties)) {
    return o.parties
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: strField(x.id),
        type: normalizeCustomerPartyType(x.type),
        label: strField(x.label),
        content: strField(x.content),
      }));
  }

  if (Array.isArray(o.copySnippets)) {
    return o.copySnippets
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: strField(x.id),
        type: partyTypeFromLabel(strField(x.label)),
        label: strField(x.label),
        content: strField(x.content),
      }));
  }

  const legacyParts: string[] = [];
  const legacyMap: Array<[string, unknown]> = [
    ["MST", o.taxId],
    ["SĐT", o.phone],
    ["EMAIL", o.email],
    ["NGƯỜI LIÊN HỆ", o.contactName],
    ["ĐỊA CHỈ", o.address],
    ["TK / THANH TOÁN", o.bankInfo],
    ["GHI CHÚ", o.detailsText ?? o.details],
  ];
  for (const [label, value] of legacyMap) {
    const text = strField(value).trim();
    if (text) legacyParts.push(`${label}: ${text}`);
  }
  if (legacyParts.length) {
    return [{ id: "legacy-info", type: "OTHER", label: "THÔNG TIN CŨ", content: legacyParts.join("\n") }];
  }
  return [];
}

function parseSavedConsigneesLoose(raw: unknown): CustomerDirectoryEntry["savedConsignees"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CustomerDirectoryEntry["savedConsignees"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    if (!id) continue;
    out.push(
      clampCustomerSavedConsignee({
        id,
        label: trimStr(o.label),
        consigneeName: trimStr(o.consigneeName),
        consigneeAddress: trimStr(o.consigneeAddress),
        consigneePhone: trimStr(o.consigneePhone),
        consigneeEmail: trimStr(o.consigneeEmail),
        notifyName: trimStr(o.notifyName),
      })
    );
  }
  return out;
}

function parseSavedShippersLoose(raw: unknown): CustomerDirectoryEntry["savedShippers"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CustomerDirectoryEntry["savedShippers"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    if (!id) continue;
    out.push(
      clampCustomerSavedShipper({
        id,
        label: trimStr(o.label),
        shipperName: trimStr(o.shipperName),
        shipperAddress: trimStr(o.shipperAddress),
        shipperPhone: trimStr(o.shipperPhone),
        shipperEmail: trimStr(o.shipperEmail),
        taxCode: trimStr(o.taxCode),
      })
    );
  }
  return out;
}

function parseSavedGoodsLoose(raw: unknown): CustomerDirectoryEntry["savedGoods"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CustomerDirectoryEntry["savedGoods"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    if (!id) continue;
    out.push(
      clampCustomerSavedGoods({
        id,
        label: trimStr(o.label),
        goodsDescription: trimStr(o.goodsDescription),
      })
    );
  }
  return out;
}

function parseSavedVehiclesLoose(raw: unknown): CustomerDirectoryEntry["savedVehicles"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CustomerDirectoryEntry["savedVehicles"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    if (!id) continue;
    out.push(
      clampCustomerSavedVehicle({
        id,
        label: trimStr(o.label),
        licensePlate: trimStr(o.licensePlate),
        driverName: trimStr(o.driverName),
        driverId: trimStr(o.driverId),
        driverIdType: trimStr(o.driverIdType) as CustomerSavedVehicle["driverIdType"],
        vehicleType: trimStr(o.vehicleType) as CustomerSavedVehicle["vehicleType"],
      })
    );
  }
  return out;
}

function parseSavedDimTemplatesLoose(raw: unknown): CustomerDirectoryEntry["savedDimTemplates"] {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CustomerDirectoryEntry["savedDimTemplates"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    const linesRaw = Array.isArray(o.lines) ? o.lines : undefined;
    const head = linesRaw && linesRaw[0] && typeof linesRaw[0] === "object"
      ? (linesRaw[0] as Record<string, unknown>)
      : null;
    const lCm = Number(head?.lCm ?? o.lCm);
    const wCm = Number(head?.wCm ?? o.wCm);
    const hCm = Number(head?.hCm ?? o.hCm);
    if (!id || !Number.isFinite(lCm) || lCm <= 0 || !Number.isFinite(wCm) || wCm <= 0 || !Number.isFinite(hCm) || hCm <= 0) continue;
    out.push(
      clampCustomerSavedDimTemplate({
        id,
        label: trimStr(o.label),
        lCm,
        wCm,
        hCm,
        stdPcsKg: Number.isFinite(o.stdPcsKg) && Number(o.stdPcsKg) > 0 ? Number(o.stdPcsKg) : undefined,
        isDefault: Boolean(o.isDefault),
        ...(linesRaw
          ? {
              lines: linesRaw.map((line) => {
                const x = line as Record<string, unknown>;
                return {
                  lCm: Number(x.lCm),
                  wCm: Number(x.wCm),
                  hCm: Number(x.hCm),
                  pcs: Number(x.pcs) || 1,
                };
              }),
            }
          : {}),
      })
    );
  }
  return out;
}

/** Parse mảng JSON an toàn — bỏ phần tử không hợp lệ; chuẩn hóa độ dài trường. */
export function parseCustomerDirectoryLoose(raw: unknown): CustomerDirectoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerDirectoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = trimStr(o.id);
    const code = trimStr(o.code);
    const name = trimStr(o.name);
    if (!id || !code || !name) continue;
    const syncedAt = toSyncedAtIso(o.syncedAt ?? o.synced_at);
    out.push(
      clampCustomerDirectoryEntry({
        id,
        code,
        name,
        shortCode: trimStr(o.shortCode),
        taxCode: trimStr(o.taxCode) || trimStr(o.taxId),
        address: trimStr(o.address),
        email: trimStr(o.email),
        phone: trimStr(o.phone),
        defaultRate: o.defaultRate as number | null | undefined,
        customerType: trimStr(o.customerType) as CustomerDirectoryEntry["customerType"],
        shipperName: trimStr(o.shipperName),
        shipperAddress: trimStr(o.shipperAddress),
        shipperPhone: trimStr(o.shipperPhone),
        shipperEmail: trimStr(o.shipperEmail),
        savedShippers: parseSavedShippersLoose(o.savedShippers),
        savedConsignees: parseSavedConsigneesLoose(o.savedConsignees),
        savedGoods: parseSavedGoodsLoose(o.savedGoods),
        savedVehicles: parseSavedVehiclesLoose(o.savedVehicles),
        savedDimTemplates: parseSavedDimTemplatesLoose(o.savedDimTemplates),
        defaultShipperId: trimStr(o.defaultShipperId),
        defaultConsigneeId: trimStr(o.defaultConsigneeId),
        defaultGoodsId: trimStr(o.defaultGoodsId),
        defaultVehicleId: trimStr(o.defaultVehicleId),
        defaultDimTemplateId: trimStr(o.defaultDimTemplateId),
        parties: parsePartiesLoose(o),
        consigneeName: trimStr(o.consigneeName),
        consigneeAddress: trimStr(o.consigneeAddress),
        consigneePhone: trimStr(o.consigneePhone),
        consigneeEmail: trimStr(o.consigneeEmail),
        notifyName: trimStr(o.notifyName),
        otherRequirementsPrint: trimStr(o.otherRequirementsPrint),
        ...(syncedAt ? { syncedAt } : {}),
      } as CustomerDirectoryEntry & {
        consigneeName?: string;
        consigneeAddress?: string;
        consigneePhone?: string;
        consigneeEmail?: string;
        notifyName?: string;
      })
    );
  }
  return out;
}

/**
 * Kiểm tra danh sách trước khi lưu — mã không trùng (không phân biệt hoa thường).
 * @throws Error với thông báo tiếng Việt
 */
export function assertCustomerDirectoryValid(entries: readonly CustomerDirectoryEntry[]): void {
  const result = validateCustomerDirectory(entries);
  if (!result.valid) {
    throw new Error(result.summary);
  }
}
/** Tra mã theo tên (khớp không phân biệt hoa thường), lấy bản ghi đầu tiên. */
export function lookupCustomerCodeByName(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string
): string {
  const hit = lookupCustomerEntryByName(directory, customerName);
  return hit?.code.trim() ?? "";
}

/** Tra cả dòng danh bạ theo tên (khớp không phân biệt hoa thường), bản ghi đầu tiên. */
export function lookupCustomerEntryByName(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string
): CustomerDirectoryEntry | undefined {
  const t = customerName.trim().toLowerCase();
  if (!t) return undefined;
  return directory.find((e) => e.name.trim().toLowerCase() === t);
}
