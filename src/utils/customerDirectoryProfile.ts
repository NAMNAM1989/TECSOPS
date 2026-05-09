import type { CustomerDirectoryEntry, CustomerParty, CustomerPartyType } from "../types/customerDirectory";

/** Giới hạn độ dài — đồng bộ client / server. */
export const CUSTOMER_PROFILE_LIMITS = {
  code: 40,
  name: 200,
  shipperName: 120,
  shipperAddress: 300,
  shipperPhone: 40,
  shipperEmail: 120,
  taxCode: 40,
  agentName: 120,
  agentAddress: 300,
  agentPhone: 40,
  agentEmail: 120,
  agentTaxCode: 40,
  consigneeName: 120,
  consigneeAddress: 300,
  consigneePhone: 40,
  consigneeEmail: 120,
  notifyName: 160,
  partyLabel: 80,
  partyContent: 8000,
  partyCount: 60,
} as const;

export const CUSTOMER_PARTY_TYPES: readonly CustomerPartyType[] = ["SHIPPER", "CNEE", "NOTIFY", "OTHER"];

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

export function emptyCustomerParty(type: CustomerPartyType = "SHIPPER", label = ""): CustomerParty {
  return {
    id: fallbackPartyId(type.toLowerCase()),
    type,
    label,
    content: "",
  };
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
  const L = CUSTOMER_PROFILE_LIMITS;
  const parties = Array.isArray(e.parties)
    ? e.parties
        .slice(0, L.partyCount)
        .map(clampCustomerParty)
        .filter((p) => p.label || p.content.trim())
    : [];
  return {
    id: clip(e.id, 80).trim(),
    code: clip(e.code, L.code).trim(),
    name: clip(e.name, L.name).trim(),
    shipperName: clip(e.shipperName ?? "", L.shipperName).trim(),
    shipperAddress: clip(e.shipperAddress ?? "", L.shipperAddress).trim(),
    shipperPhone: clip(e.shipperPhone ?? "", L.shipperPhone).trim(),
    shipperEmail: clip(e.shipperEmail ?? "", L.shipperEmail).trim(),
    taxCode: clip(e.taxCode ?? "", L.taxCode).trim(),
    agentName: clip(e.agentName ?? "", L.agentName).trim(),
    agentAddress: clip(e.agentAddress ?? "", L.agentAddress).trim(),
    agentPhone: clip(e.agentPhone ?? "", L.agentPhone).trim(),
    agentEmail: clip(e.agentEmail ?? "", L.agentEmail).trim(),
    agentTaxCode: clip(e.agentTaxCode ?? "", L.agentTaxCode).trim(),
    consigneeName: clip(e.consigneeName ?? "", L.consigneeName).trim(),
    consigneeAddress: clip(e.consigneeAddress ?? "", L.consigneeAddress).trim(),
    consigneePhone: clip(e.consigneePhone ?? "", L.consigneePhone).trim(),
    consigneeEmail: clip(e.consigneeEmail ?? "", L.consigneeEmail).trim(),
    notifyName: clip(e.notifyName ?? "", L.notifyName).trim(),
    parties,
  };
}

/** Một dòng ngắn: mã · tên. */
export function buildCustomerCodeNameLine(e: CustomerDirectoryEntry): string {
  return `${e.code.trim()} · ${e.name.trim()}`.trim();
}

export function partyTypeLabel(type: CustomerPartyType): string {
  if (type === "OTHER") return "KHÁC";
  return type;
}

export function buildCustomerPartyTitle(p: CustomerParty): string {
  const label = p.label.trim();
  if (!label) return partyTypeLabel(p.type);
  return label.toUpperCase() === p.type ? p.type : `${partyTypeLabel(p.type)} - ${label}`;
}

export function buildCustomerPartyBlock(p: CustomerParty): string {
  const title = buildCustomerPartyTitle(p);
  const content = p.content.trim();
  if (!content) return title;
  return `${title}:\n${content}`;
}

export function buildCustomerQuickCopyBlock(e: CustomerDirectoryEntry): string {
  const blocks = e.parties
    .filter((p) => p.content.trim())
    .map(buildCustomerPartyBlock)
    .filter(Boolean);
  return blocks.length > 0 ? blocks.join("\n\n") : buildCustomerCodeNameLine(e);
}

export function customerPartiesByType(
  entry: CustomerDirectoryEntry | undefined,
  type: CustomerPartyType | "ALL"
): CustomerParty[] {
  if (!entry) return [];
  if (type === "ALL") return entry.parties;
  return entry.parties.filter((p) => p.type === type);
}

/** Một dòng trống cho form thêm mới. */
export function emptyCustomerProfileRow(id: string): CustomerDirectoryEntry {
  return {
    id,
    code: "",
    name: "",
    shipperName: "",
    shipperAddress: "",
    shipperPhone: "",
    shipperEmail: "",
    taxCode: "",
    agentName: "",
    agentAddress: "",
    agentPhone: "",
    agentEmail: "",
    agentTaxCode: "",
    consigneeName: "",
    consigneeAddress: "",
    consigneePhone: "",
    consigneeEmail: "",
    notifyName: "",
    parties: [],
  };
}
