import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { lookupCustomerCodeByName, lookupCustomerEntryByName } from "./customerDirectoryCore";
import { buildShipmentPrintProfilePatch } from "./customerPrintProfileLink";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Giữ chữ HOA khi đang gõ (không trim — tránh nuốt khoảng trắng cuối). */
export function customerNameWhileTyping(raw: string): string {
  return raw.toUpperCase();
}

/** Tên khách lưu trên lô — luôn trim + HOA. */
export function normalizeCustomerNameInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Lọc danh bạ khách theo mã hoặc tên (không phân biệt hoa thường). */
export function filterCustomerDirectoryEntries(
  directory: readonly CustomerDirectoryEntry[],
  query: string,
  limit = 12,
  preferredId?: string
): CustomerDirectoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const list = [...directory];
    const pref = preferredId?.trim();
    if (pref) {
      const idx = list.findIndex((e) => e.id.trim() === pref);
      if (idx > 0) {
        const [hit] = list.splice(idx, 1);
        list.unshift(hit);
      }
    }
    return list.slice(0, limit);
  }

  const hits: CustomerDirectoryEntry[] = [];
  for (const entry of directory) {
    const code = entry.code.trim().toLowerCase();
    const name = entry.name.trim().toLowerCase();
    const shortCode = (entry.shortCode ?? "").trim().toLowerCase();
    if (code.includes(q) || name.includes(q) || shortCode.includes(q)) {
      hits.push(entry);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

function resolveCustomerEntry(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string,
  entry?: CustomerDirectoryEntry
): CustomerDirectoryEntry | undefined {
  if (entry) return entry;
  const trimmed = customerName.trim();
  if (!trimmed) return undefined;
  return (
    lookupCustomerEntryByName(directory, trimmed) ??
    directory.find((e) => norm(e.code) === norm(lookupCustomerCodeByName(directory, trimmed)))
  );
}

/** Patch lô khi chọn / gõ khách — mã, id, Shipper/CNEE/Tên hàng mặc định từ danh bạ. */
export function buildShipmentPatchForCustomerSelection(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string,
  entry?: CustomerDirectoryEntry,
  booking?: Pick<
    Shipment,
    "customerShipperId" | "customerConsigneeId" | "customerGoodsId"
  >
): Partial<Shipment> {
  const trimmed = normalizeCustomerNameInput(customerName);
  const resolved = resolveCustomerEntry(directory, trimmed, entry);
  const code = resolved?.code.trim() ?? lookupCustomerCodeByName(directory, trimmed);
  const customerId = resolved?.id ?? "";

  return {
    customer: trimmed,
    customerCode: code,
    customerId,
    ...buildShipmentPrintProfilePatch(resolved, booking),
  };
}
