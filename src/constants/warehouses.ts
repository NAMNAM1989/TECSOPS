import type { Warehouse } from "../types/shipment";

/** Bộ lọc / layout: một kho cụ thể hoặc hiện tất cả. */
export type WarehouseLayoutFilter = Warehouse | "ALL";

/**
 * 3 kho hoạt động lên sân bay (phạm vi báo cáo / copy ảnh / nhóm UI):
 * - TECS: một kho — trong DB có 2 mã lô `TECS-TCS` và `TECS-SCSC` (chỉ là tên mã, không phải kho TCS/SCSC)
 * - TCS: kho riêng — chỉ mã `TCS` (không gồm `TECS-TCS`)
 * - SCSC: kho riêng — chỉ mã `SCSC` (không gồm `TECS-SCSC`)
 *
 * Không dùng WarehouseFamily để lọc báo cáo OPS — family chỉ cho DIM/workflow.
 */
export type OpsTeam = "TECS" | "TCS" | "SCSC";

/**
 * Family công cụ (DIM / workflow) — khác OpsTeam.
 * `TECS-TCS`+`TCS` → family TCS; `TECS-SCSC`+`SCSC` → family SCSC.
 * Không dùng để quyết định phạm vi ảnh báo cáo 3 kho.
 */
export type WarehouseFamily = "TCS" | "SCSC";

/** Vai trò mã lô: thuộc kho TECS (2 mã) vs kho trực tiếp TCS/SCSC. */
export type WarehouseRole = "tecs_hub" | "direct";

export type WarehouseCapability =
  | "dimScscRules"
  | "dimTcsTemplate";

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
};

const SCSC_HUB_CAPS: WarehouseCapabilities = {
  dimScscRules: true,
  dimTcsTemplate: false,
};

const TCS_DIRECT_CAPS: WarehouseCapabilities = {
  dimScscRules: false,
  dimTcsTemplate: true,
};

const SCSC_DIRECT_CAPS: WarehouseCapabilities = {
  dimScscRules: true,
  dimTcsTemplate: false,
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

/** Family TCS — mẫu DIM TCS (TECS-TCS + TCS). */
export function isTcsFamily(w: Warehouse): boolean {
  return warehouseFamily(w) === "TCS";
}

/** Alias tương thích — family SCSC (công cụ DIM). Không dùng để phân đội OPS. */
export function isScscWarehouse(w: Warehouse): boolean {
  return isScscFamily(w);
}

/** Alias tương thích — family TCS (DIM). Không dùng để phân đội OPS. */
export function isTcsWarehouse(w: Warehouse): boolean {
  return isTcsFamily(w);
}

/**
 * Mã lô thuộc kho TECS (`TECS-TCS` hoặc `TECS-SCSC`).
 * Không bao gồm kho riêng `TCS` / `SCSC`.
 */
export function isTecsHub(w: Warehouse): boolean {
  return warehouseRole(w) === "tecs_hub";
}

/** Mã lô thuộc kho riêng TCS hoặc SCSC (không phải mã trong kho TECS). */
export function isDirectOpsWarehouse(w: Warehouse): boolean {
  return warehouseRole(w) === "direct";
}

/** Kho hoạt động (OpsTeam) phụ trách mã lô này. */
export function opsTeamOf(w: Warehouse): OpsTeam {
  if (isTecsHub(w)) return "TECS";
  if (w === "TCS") return "TCS";
  return "SCSC";
}

/**
 * Các mã lô thuộc phạm vi một kho hoạt động (báo cáo ảnh / copy):
 * - TECS → chỉ `TECS-TCS` + `TECS-SCSC` (không lấy kho `TCS`/`SCSC`)
 * - TCS → chỉ `TCS` (không lấy `TECS-TCS`)
 * - SCSC → chỉ `SCSC` (không lấy `TECS-SCSC`)
 */
export function warehousesOfOpsTeam(team: OpsTeam): readonly Warehouse[] {
  switch (team) {
    case "TECS":
      return ["TECS-TCS", "TECS-SCSC"];
    case "TCS":
      return ["TCS"];
    case "SCSC":
      return ["SCSC"];
  }
}

/** Nhãn kho hoạt động (UI). */
export const opsTeamLabel: Record<OpsTeam, string> = {
  TECS: "OPS TECS",
  TCS: "OPS TCS",
  SCSC: "OPS SCSC",
};

/** Thứ tự nhóm thẻ kho trên UI: TECS → TCS → SCSC. */
export const OPS_TEAM_ORDER: readonly OpsTeam[] = ["TECS", "TCS", "SCSC"];

/** Danh sách kho cần render section (desktop/mobile) theo bộ lọc trên trang. */
export function warehouseSectionsForLayout(filter: WarehouseLayoutFilter): readonly Warehouse[] {
  return filter === "ALL" ? WAREHOUSE_ORDER : [filter];
}
