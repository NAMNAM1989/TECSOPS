import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { statusOrderForWarehouse } from "../utils/shipmentWorkflowStatus";

export type StatusStage = "booking" | "warehouse" | "docs" | "done" | "legacy";

export const statusStage: Record<ShipmentStatus, StatusStage> = {
  PENDING: "booking",
  RECEIVED: "warehouse",
  VOLUME_DONE: "warehouse",
  OLA_PULL: "docs",
  RECEPTION_COMPLETED: "docs",
  WEIGH_SLIP: "done",
  CUSTOMS: "legacy",
  SECURITY: "legacy",
  COMPLETED: "legacy",
};

export const stageLabel: Record<StatusStage, string> = {
  booking: "Booking",
  warehouse: "Tại kho",
  docs: "Chứng từ",
  done: "Kết thúc",
  legacy: "Lịch sử",
};

/**
 * Nhãn chuẩn một nguồn — filter / select / stats dùng cùng từ vựng.
 * Compact chỉ rút gọn cùng gốc (Nhận hàng → Nhận, Hoàn thành tiếp nhận → HT).
 */
export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "Booking",
  RECEIVED: "Nhận hàng",
  VOLUME_DONE: "Đã đo Volume",
  CUSTOMS: "Hải quan",
  SECURITY: "An ninh",
  OLA_PULL: "Kéo OLA",
  RECEPTION_COMPLETED: "Hoàn thành tiếp nhận",
  WEIGH_SLIP: "Nộp tờ cân",
  COMPLETED: "Hoàn thành",
};

/** Alias rõ nghĩa — dropdown desktop / aria dùng cùng bộ với filter. */
export const statusLabelShort = statusLabel;

/** Nhãn cực ngắn — card điện thoại / filter dense. Cùng gốc với statusLabel. */
export const statusLabelCompact: Record<ShipmentStatus, string> = {
  PENDING: "Booking",
  RECEIVED: "Nhận",
  VOLUME_DONE: "Volume",
  CUSTOMS: "HQ",
  SECURITY: "AN",
  OLA_PULL: "OLA",
  RECEPTION_COMPLETED: "HT",
  WEIGH_SLIP: "Tờ cân",
  COMPLETED: "Xong",
};

/** Icon ngắn kèm text — không chỉ dựa vào màu. */
export const statusIcon: Record<ShipmentStatus, string> = {
  PENDING: "○",
  RECEIVED: "↓",
  VOLUME_DONE: "▣",
  CUSTOMS: "◇",
  SECURITY: "△",
  OLA_PULL: "↗",
  RECEPTION_COMPLETED: "✓",
  WEIGH_SLIP: "⚖",
  COMPLETED: "★",
};

/** Lớp CSS cho badge trạng thái theo thiết kế v2 (WCAG AA). */
export const statusBadgeClass: Record<ShipmentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  RECEIVED: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  VOLUME_DONE: "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  OLA_PULL: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:border-fuchsia-800",
  RECEPTION_COMPLETED: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  WEIGH_SLIP: "bg-green-700 text-white border-green-700 dark:bg-green-400 dark:text-green-950 dark:border-green-400",
  CUSTOMS: "bg-slate-100 text-slate-700 border-slate-300 border-dashed dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  SECURITY: "bg-slate-100 text-slate-700 border-slate-300 border-dashed dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  COMPLETED: "bg-slate-100 text-slate-700 border-slate-300 border-dashed dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

/** Màu chấm tròn (StatusProgress, indicator). */
export const statusDotClass: Record<ShipmentStatus, string> = {
  PENDING: "bg-amber-500",
  RECEIVED: "bg-blue-500",
  VOLUME_DONE: "bg-cyan-500",
  OLA_PULL: "bg-fuchsia-500",
  RECEPTION_COMPLETED: "bg-teal-600",
  WEIGH_SLIP: "bg-green-600",
  CUSTOMS: "bg-slate-400",
  SECURITY: "bg-slate-400",
  COMPLETED: "bg-slate-400",
};

/** Lớp CSS viền ring ngoài cho chấm hiện tại. */
export const statusRingClass: Record<ShipmentStatus, string> = {
  PENDING: "ring-amber-500",
  RECEIVED: "ring-blue-500",
  VOLUME_DONE: "ring-cyan-500",
  OLA_PULL: "ring-fuchsia-500",
  RECEPTION_COMPLETED: "ring-teal-600",
  WEIGH_SLIP: "ring-green-600",
  CUSTOMS: "ring-slate-400",
  SECURITY: "ring-slate-400",
  COMPLETED: "ring-slate-400",
};

/** Lớp CSS vạch trước / vạch trái của trạng thái. */
export const statusBarClass: Record<ShipmentStatus, string> = {
  PENDING: "before:bg-amber-500",
  RECEIVED: "before:bg-blue-500",
  VOLUME_DONE: "before:bg-cyan-500",
  OLA_PULL: "before:bg-fuchsia-500",
  RECEPTION_COMPLETED: "before:bg-teal-600",
  WEIGH_SLIP: "before:bg-green-600",
  CUSTOMS: "before:bg-slate-400",
  SECURITY: "before:bg-slate-400",
  COMPLETED: "before:bg-slate-400",
};

/** "3/6" theo workflow kho; null nếu mã lịch sử. */
export function statusStep(status: ShipmentStatus, warehouse: Warehouse): { n: number; of: number } | null {
  const order = statusOrderForWarehouse(warehouse);
  const i = order.indexOf(status);
  return i < 0 ? null : { n: i + 1, of: order.length };
}

/** Card hàng — viền trái màu trạng thái + surface phẳng. */
export const statusRowBg = "bg-ui-surface";

export const statusRowAccent: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-amber-500",
  RECEIVED: "border-l-[3px] border-l-blue-500",
  VOLUME_DONE: "border-l-[3px] border-l-cyan-500",
  CUSTOMS: "border-l-[3px] border-l-slate-400",
  SECURITY: "border-l-[3px] border-l-slate-400",
  OLA_PULL: "border-l-[3px] border-l-fuchsia-500",
  RECEPTION_COMPLETED: "border-l-[3px] border-l-teal-600",
  WEIGH_SLIP: "border-l-[3px] border-l-green-600",
  COMPLETED: "border-l-[3px] border-l-slate-400",
};

/** Hàng được chọn — tint teal nhẹ Round 2. */
export const statusRowSelected = "bg-teal-500/[0.08] ring-1 ring-teal-600/35";

/** Dropdown / pill trạng thái — tương thích ngược với code cũ, dùng statusBadgeClass. */
export const statusSelectSurface: Record<ShipmentStatus, string> = statusBadgeClass;

/** Màu nhấn số hiệu chuyến bay. */
export const flightNumberAccent = "text-violet-900";
