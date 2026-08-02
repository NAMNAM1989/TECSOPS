import type { Warehouse } from "../types/shipment";

/** Bộ lọc / layout: một kho cụ thể hoặc hiện tất cả. */
export type WarehouseLayoutFilter = Warehouse | "ALL";

/** Family công cụ (DIM / portal / workflow). */
export type WarehouseFamily = "TCS" | "SCSC";

/** Vai trò kho: hub trung gian TECS vs kho trực tiếp. */
export type WarehouseRole = "tecs_hub" | "direct";

export type WarehouseCapability =
  | "dimScscRules"
  | "dimTcsTemplate"
  | "tcsPortal"
  | "vehicleRegistration";

export type WarehouseCapabilities = Readonly<Record<WarehouseCapability, boolean>>;

export type WarehouseMeta = {
  id: Warehouse;
  label: string;
  family: WarehouseFamily;
  role: WarehouseRole;
  capabilities: WarehouseCapabilities;
};

const TCS_HUB_CAPS: WarehouseCapabilities = {
  dimScscRules: false,
  dimTcsTemplate: true,
  tcsPortal: true,
  vehicleRegistration: false,
};

const SCSC_HUB_CAPS: WarehouseCapabilities = {
  dimScscRules: true,
  dimTcsTemplate: false,
  tcsPortal: false,
  vehicleRegistration: false,
};

const TCS_DIRECT_CAPS: WarehouseCapabilities = {
  dimScscRules: false,
  dimTcsTemplate: true,
  tcsPortal: true,
  vehicleRegistration: true,
};

const SCSC_DIRECT_CAPS: WarehouseCapabilities = {
  dimScscRules: true,
  dimTcsTemplate: false,
  tcsPortal: false,
  vehicleRegistration: true,
};

/**
 * Nguồn sự thật cấu hình kho.
 * Thứ tự: hub TECS trước, kho trực tiếp sau.
 */
export const WAREHOUSE_REGISTRY: Readonly<Record<Warehouse, WarehouseMeta>> = {
  "TECS-TCS": {
    id: "TECS-TCS",
    label: "TECS-TCS",
    family: "TCS",
    role: "tecs_hub",
    capabilities: TCS_HUB_CAPS,
  },
  "TECS-SCSC": {
    id: "TECS-SCSC",
    label: "TECS-SCSC",
    family: "SCSC",
    role: "tecs_hub",
    capabilities: SCSC_HUB_CAPS,
  },
  TCS: {
    id: "TCS",
    label: "TCS",
    family: "TCS",
    role: "direct",
    capabilities: TCS_DIRECT_CAPS,
  },
  SCSC: {
    id: "SCSC",
    label: "SCSC",
    family: "SCSC",
    role: "direct",
    capabilities: SCSC_DIRECT_CAPS,
  },
};

/** Thứ tự cột kho trên bảng desktop & mobile. */
export const WAREHOUSE_ORDER: readonly Warehouse[] = ["TECS-TCS", "TECS-SCSC", "TCS", "SCSC"];

const WAREHOUSE_SET = new Set<string>(WAREHOUSE_ORDER);

/** Nhãn hiển thị (UI / form). Mã lưu DB vẫn là giá trị `Warehouse`. */
export const warehouseLabel: Record<Warehouse, string> = {
  "TECS-TCS": WAREHOUSE_REGISTRY["TECS-TCS"].label,
  "TECS-SCSC": WAREHOUSE_REGISTRY["TECS-SCSC"].label,
  TCS: WAREHOUSE_REGISTRY.TCS.label,
  SCSC: WAREHOUSE_REGISTRY.SCSC.label,
};

/** Khởi tạo Record theo đủ 4 kho (tránh hardcode). */
export function emptyWarehouseRecord<T>(factory: () => T): Record<Warehouse, T> {
  return Object.fromEntries(WAREHOUSE_ORDER.map((w) => [w, factory()])) as Record<Warehouse, T>;
}

/**
 * Map kho khi load / nhập — exact-match trước, legacy KHO-* → hub TECS.
 * Không dùng substring (tránh gộp nhầm SCSC/TCS vào TECS-*).
 */
export function normalizeWarehouse(raw: unknown, fallback: Warehouse = "TECS-TCS"): Warehouse {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
  if (WAREHOUSE_SET.has(u)) return u as Warehouse;
  if (u === "KHO-SCSC") return "TECS-SCSC";
  if (u === "KHO-TCS") return "TECS-TCS";
  return fallback;
}

export function warehouseMeta(w: Warehouse): WarehouseMeta {
  return WAREHOUSE_REGISTRY[w] ?? WAREHOUSE_REGISTRY["TECS-TCS"];
}

export function warehouseFamily(w: Warehouse): WarehouseFamily {
  return warehouseMeta(w).family;
}

export function warehouseRole(w: Warehouse): WarehouseRole {
  return warehouseMeta(w).role;
}

export function hasWarehouseCapability(w: Warehouse, cap: WarehouseCapability): boolean {
  return warehouseMeta(w).capabilities[cap] === true;
}

/** Family SCSC — phiếu cân / DIM SCSC (TECS-SCSC + SCSC). */
export function isScscFamily(w: Warehouse): boolean {
  return warehouseFamily(w) === "SCSC";
}

/** Family TCS — mẫu DIM TCS / portal (TECS-TCS + TCS). */
export function isTcsFamily(w: Warehouse): boolean {
  return warehouseFamily(w) === "TCS";
}

/** Alias tương thích — family SCSC. */
export function isScscWarehouse(w: Warehouse): boolean {
  return isScscFamily(w);
}

/** Alias tương thích — family TCS. */
export function isTcsWarehouse(w: Warehouse): boolean {
  return isTcsFamily(w);
}

/** Danh sách kho cần render section (desktop/mobile) theo bộ lọc trên trang. */
export function warehouseSectionsForLayout(filter: WarehouseLayoutFilter): readonly Warehouse[] {
  return filter === "ALL" ? WAREHOUSE_ORDER : [filter];
}
