import type { Warehouse } from "../types/shipment";
import { WAREHOUSE_ORDER } from "../constants/warehouses";

/** Gợi ý tên mặc định — giữ khớp `SEED_NAMES` trong `server/customerDirectorySeed.mjs` (migrate danh bạ). */
export const CUSTOMERS = [] as const;

export const WAREHOUSES: readonly Warehouse[] = WAREHOUSE_ORDER;

export const DESTINATIONS = [
  "KUL", "TPE", "SYD", "CDG", "NRT", "SZX", "MNL", "KCH",
  "MEL", "SIN", "AMS", "YVR", "XMN", "DOH", "DXB", "HKG",
  "BKK", "ICN", "FRA", "LHR", "LAX", "ORD", "PVG", "CAN",
] as const;
