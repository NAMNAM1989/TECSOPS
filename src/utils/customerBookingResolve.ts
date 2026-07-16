import type { Shipment } from "../types/shipment";
import type {
  CustomerDirectoryEntry,
  CustomerSavedConsignee,
  CustomerSavedGoods,
  CustomerSavedShipper,
} from "../types/customerDirectory";
import { compactCustomerMatchKey } from "./customerCodeOps";
import { lookupCustomerEntryByName } from "./customerDirectoryCore";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function findByCompactKey(
  directory: readonly CustomerDirectoryEntry[],
  raw: string
): CustomerDirectoryEntry | undefined {
  const key = compactCustomerMatchKey(raw);
  if (!key) return undefined;
  return (
    directory.find((e) => compactCustomerMatchKey(e.code) === key) ??
    directory.find((e) => compactCustomerMatchKey(e.shortCode ?? "") === key) ??
    directory.find((e) => compactCustomerMatchKey(e.name) === key)
  );
}

export function findCustomerEntry(
  booking: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): CustomerDirectoryEntry | undefined {
  const customerIdRaw = booking.customerId?.trim();
  const codeRaw = booking.customerCode?.trim();
  const nameRaw = booking.customer?.trim();
  if (customerIdRaw) {
    const byId = directory.find((e) => norm(e.id) === norm(customerIdRaw));
    if (byId) return byId;
  }
  if (codeRaw) {
    const byCode = directory.find((e) => norm(e.code) === norm(codeRaw));
    if (byCode) return byCode;
    const byCompactCode = findByCompactKey(directory, codeRaw);
    if (byCompactCode) return byCompactCode;
  }
  if (nameRaw) {
    const byLookup = lookupCustomerEntryByName(directory, nameRaw);
    if (byLookup) return byLookup;
    const byName = directory.find((e) => norm(e.name) === norm(nameRaw));
    if (byName) return byName;
    const nameAsCode = directory.find((e) => norm(e.code) === norm(nameRaw));
    if (nameAsCode) return nameAsCode;
    const nameAsShort = directory.find((e) => norm(e.shortCode ?? "") === norm(nameRaw));
    if (nameAsShort) return nameAsShort;
    const byCompactName = findByCompactKey(directory, nameRaw);
    if (byCompactName) return byCompactName;
  }
  return undefined;
}

/** Shipper lưu sẵn: theo `customerShipperId`, hoặc một mục nếu danh bạ chỉ có một. */
export function resolveSavedShipperForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleShipper?: boolean }
): CustomerSavedShipper | undefined {
  const list = customer?.savedShippers ?? [];
  if (!list.length) return undefined;
  const id = booking.customerShipperId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleShipper) return undefined;
  const defId = customer?.defaultShipperId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

/** CNEE lưu sẵn: theo `customerConsigneeId`, hoặc một mục nếu danh bạ chỉ có một. */
export function resolveSavedConsigneeForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleConsignee?: boolean }
): CustomerSavedConsignee | undefined {
  const list = customer?.savedConsignees ?? [];
  if (!list.length) return undefined;
  const id = booking.customerConsigneeId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleConsignee) return undefined;
  const defId = customer?.defaultConsigneeId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}

/** Tên hàng lưu sẵn theo khách. */
export function resolveSavedGoodsForBooking(
  booking: Shipment,
  customer: CustomerDirectoryEntry | undefined,
  opts?: { skipAutoSingleGoods?: boolean }
): CustomerSavedGoods | undefined {
  const list = customer?.savedGoods ?? [];
  if (!list.length) return undefined;
  const id = booking.customerGoodsId?.trim();
  if (id) return list.find((x) => norm(x.id) === norm(id));
  if (opts?.skipAutoSingleGoods) return undefined;
  const defId = customer?.defaultGoodsId?.trim();
  if (defId) {
    const d = list.find((x) => norm(x.id) === norm(defId));
    if (d) return d;
  }
  if (list.length === 1) return list[0];
  return undefined;
}
