/**
 * CRUD generic cho danh sách lưu sẵn trên danh bạ khách
 * (shipper / consignee / goods / vehicle).
 */
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { withNewDefault } from "./customerDirectoryScaffold";

type ListKey = "savedShippers" | "savedConsignees" | "savedGoods" | "savedVehicles";
type DefaultKey =
  | "defaultShipperId"
  | "defaultConsigneeId"
  | "defaultGoodsId"
  | "defaultVehicleId";

type SavedItem = { id: string };

function mapCustomer(
  rows: CustomerDirectoryEntry[],
  customerId: string,
  fn: (row: CustomerDirectoryEntry) => CustomerDirectoryEntry
): CustomerDirectoryEntry[] {
  return rows.map((row) => (row.id === customerId ? fn(row) : row));
}

export function patchCustomerSavedListItem<T extends SavedItem>(
  rows: CustomerDirectoryEntry[],
  customerId: string,
  listKey: ListKey,
  index: number,
  patch: Partial<T>,
  afterPatch?: (
    row: CustomerDirectoryEntry,
    list: T[],
    index: number,
    patch: Partial<T>
  ) => CustomerDirectoryEntry
): CustomerDirectoryEntry[] {
  return mapCustomer(rows, customerId, (row) => {
    const list = [...((row[listKey] as T[] | undefined) ?? [])];
    const cur = list[index];
    if (!cur) return row;
    list[index] = { ...cur, ...patch };
    const next = { ...row, [listKey]: list } as CustomerDirectoryEntry;
    return afterPatch ? afterPatch(next, list, index, patch) : next;
  });
}

export function removeCustomerSavedListItem(
  rows: CustomerDirectoryEntry[],
  customerId: string,
  listKey: ListKey,
  defaultKey: DefaultKey,
  index: number
): CustomerDirectoryEntry[] {
  return mapCustomer(rows, customerId, (row) => {
    const prev = (row[listKey] as SavedItem[] | undefined) ?? [];
    const list = prev.filter((_, i) => i !== index);
    const removed = prev[index];
    const defaultId = row[defaultKey];
    const cleared =
      removed && defaultId === removed.id ? { [defaultKey]: undefined } : {};
    return { ...row, [listKey]: list, ...cleared } as CustomerDirectoryEntry;
  });
}

export function addCustomerSavedListItem<T extends SavedItem>(
  rows: CustomerDirectoryEntry[],
  customerId: string,
  listKey: ListKey,
  defaultKey: DefaultKey,
  emptyItem: () => T
): CustomerDirectoryEntry[] {
  return mapCustomer(rows, customerId, (row) => {
    const item = emptyItem();
    const { list, defaultId } = withNewDefault(
      (row[listKey] as T[] | undefined) ?? [],
      item,
      row[defaultKey]
    );
    return { ...row, [listKey]: list, [defaultKey]: defaultId } as CustomerDirectoryEntry;
  });
}
