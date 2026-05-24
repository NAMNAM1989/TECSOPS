import type { ShipmentStatus } from "../types/shipment";

export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "BOOKING",
  RECEIVED: "ĐÃ NHẬN HÀNG",
  VOLUME_DONE: "ĐÃ ĐO VOLUME",
  CUSTOMS: "HẢI QUAN",
  SECURITY: "AN NINH",
  OLA_PULL: "KÉO OLA",
  WEIGH_SLIP: "NỘP TỜ CÂN",
  COMPLETED: "HOÀN THÀNH",
};

/** Card hàng — nền trắng/surface, viền trái màu trạng thái. */
export const statusRowBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-white dark:bg-dashboard-surface-dark",
  RECEIVED: "bg-white dark:bg-dashboard-surface-dark",
  VOLUME_DONE: "bg-white dark:bg-dashboard-surface-dark",
  CUSTOMS: "bg-white dark:bg-dashboard-surface-dark",
  SECURITY: "bg-white dark:bg-dashboard-surface-dark",
  OLA_PULL: "bg-white dark:bg-dashboard-surface-dark",
  WEIGH_SLIP: "bg-white dark:bg-dashboard-surface-dark",
  COMPLETED: "bg-white dark:bg-dashboard-surface-dark",
};

export const statusRowAccent: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-blue-400",
  RECEIVED: "border-l-[3px] border-l-amber-400",
  VOLUME_DONE: "border-l-[3px] border-l-cyan-400",
  CUSTOMS: "border-l-[3px] border-l-sky-500",
  SECURITY: "border-l-[3px] border-l-orange-400",
  OLA_PULL: "border-l-[3px] border-l-fuchsia-500",
  WEIGH_SLIP: "border-l-[3px] border-l-lime-500",
  COMPLETED: "border-l-[3px] border-l-emerald-400",
};

/** @deprecated */
export const statusRowBorder: Record<ShipmentStatus, string> = statusRowAccent;

/** Hàng được chọn — tint amber nhẹ. */
export const statusRowSelected =
  "bg-amber-50/80 ring-1 ring-amber-200/60 dark:bg-amber-500/[0.08] dark:ring-amber-400/25";

/** Dropdown trạng thái — nền tint 15% (translucent). */
export const statusSelectSurface: Record<ShipmentStatus, string> = {
  PENDING:
    "bg-blue-500/15 text-blue-700 border-blue-500/20 dark:bg-blue-400/15 dark:text-blue-200 dark:border-blue-400/25",
  RECEIVED:
    "bg-amber-500/15 text-amber-800 border-amber-500/20 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/25",
  VOLUME_DONE:
    "bg-cyan-500/15 text-cyan-800 border-cyan-500/20 dark:bg-cyan-400/15 dark:text-cyan-200 dark:border-cyan-400/25",
  CUSTOMS:
    "bg-sky-500/15 text-sky-800 border-sky-500/20 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-400/25",
  SECURITY:
    "bg-orange-500/15 text-orange-800 border-orange-500/20 dark:bg-orange-400/15 dark:text-orange-200 dark:border-orange-400/25",
  OLA_PULL:
    "bg-fuchsia-500/15 text-fuchsia-800 border-fuchsia-500/20 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:border-fuchsia-400/25",
  WEIGH_SLIP:
    "bg-lime-500/15 text-lime-800 border-lime-500/20 dark:bg-lime-400/15 dark:text-lime-200 dark:border-lime-400/25",
  COMPLETED:
    "bg-emerald-500/15 text-emerald-800 border-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:border-emerald-400/25",
};

export const statusBadge: Record<ShipmentStatus, string> = {
  PENDING: "bg-blue-500/15 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200 font-bold",
  RECEIVED: "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200 font-bold",
  VOLUME_DONE: "bg-cyan-500/15 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-200 font-bold",
  CUSTOMS: "bg-sky-500/15 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200 font-bold",
  SECURITY: "bg-orange-500/15 text-orange-900 dark:bg-orange-400/15 dark:text-orange-200 font-bold",
  OLA_PULL: "bg-fuchsia-500/15 text-fuchsia-900 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 font-bold",
  WEIGH_SLIP: "bg-lime-500/15 text-lime-900 dark:bg-lime-400/15 dark:text-lime-200 font-bold",
  COMPLETED: "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300 font-bold",
};

export const statusCardBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-blue-50/95 border-blue-200/60 dark:bg-blue-500/10 dark:border-blue-400/30",
  RECEIVED: "bg-amber-50/95 border-amber-200/60 dark:bg-amber-500/10 dark:border-amber-400/30",
  VOLUME_DONE: "bg-cyan-50/95 border-cyan-200/60 dark:bg-cyan-500/10 dark:border-cyan-400/30",
  CUSTOMS: "bg-sky-50/95 border-sky-200/60 dark:bg-sky-500/10 dark:border-sky-400/30",
  SECURITY: "bg-orange-50/95 border-orange-200/60 dark:bg-orange-500/10 dark:border-orange-400/30",
  OLA_PULL: "bg-fuchsia-50/95 border-fuchsia-200/60 dark:bg-fuchsia-500/10 dark:border-fuchsia-400/30",
  WEIGH_SLIP: "bg-lime-50/95 border-lime-200/60 dark:bg-lime-500/10 dark:border-lime-400/30",
  COMPLETED: "bg-emerald-50/95 border-emerald-200/60 dark:bg-emerald-500/10 dark:border-emerald-400/30",
};

/** Màu nhấn số hiệu chuyến bay. */
export const flightNumberAccent = "text-violet-700 dark:text-violet-300";
