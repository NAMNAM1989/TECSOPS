import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { parseCustomerDirectoryLoose } from "./customerDirectoryCore";

const KEY = "tecsops-customer-directory-v1";

export function loadCustomerDirectoryFromStorage(): CustomerDirectoryEntry[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    const list = parseCustomerDirectoryLoose(parsed);
    return list.length ? list : [];
  } catch {
    return null;
  }
}

export function saveCustomerDirectoryToStorage(entries: readonly CustomerDirectoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}
