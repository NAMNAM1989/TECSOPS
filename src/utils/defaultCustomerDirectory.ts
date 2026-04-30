import { CUSTOMERS } from "../data/customers";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";

/** Danh bạ mặc định khi state chưa có trường `customers` (migrate). */
export function buildDefaultCustomerDirectory(): CustomerDirectoryEntry[] {
  return CUSTOMERS.map((name, i) => ({
    id: `seed-${i}`,
    code: `KH${String(i + 1).padStart(3, "0")}`,
    name,
  }));
}
