import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { buildShipmentPatchForSavedConsignee } from "./customerConsigneeShipmentPatch";
import { lookupCustomerCodeByName, lookupCustomerEntryByName } from "./customerDirectoryCore";

function norm(s: string): string {
  return s.trim().toLowerCase();
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
    if (code.includes(q) || name.includes(q)) {
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

/** Patch lô khi chọn / gõ khách — đồng bộ mã, id, shipper/CNEE mặc định nếu chỉ có một. */
export function buildShipmentPatchForCustomerSelection(
  directory: readonly CustomerDirectoryEntry[],
  customerName: string,
  entry?: CustomerDirectoryEntry
): Partial<Shipment> {
  const trimmed = customerName.trim();
  const resolved = resolveCustomerEntry(directory, trimmed, entry);
  const code = resolved?.code.trim() ?? lookupCustomerCodeByName(directory, trimmed);
  const customerId = resolved?.id ?? "";
  const soleShipper =
    resolved?.savedShippers?.length === 1 ? resolved.savedShippers[0] : undefined;
  const soleConsignee =
    resolved?.savedConsignees?.length === 1 ? resolved.savedConsignees[0] : undefined;

  return {
    customer: trimmed,
    customerCode: code,
    customerId,
    customerShipperId: soleShipper?.id ?? "",
    shipperNamePrint: soleShipper?.shipperName?.trim() ?? "",
    shipperAddressPrint: soleShipper?.shipperAddress ?? "",
    shipperPhonePrint: soleShipper?.shipperPhone?.trim() ?? "",
    shipperEmailPrint: soleShipper?.shipperEmail?.trim() ?? "",
    taxCodePrint: soleShipper?.taxCode?.trim() ?? "",
    ...buildShipmentPatchForSavedConsignee(soleConsignee),
  };
}
