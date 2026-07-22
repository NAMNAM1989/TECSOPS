import type { ShipmentStatus } from "../types/shipment";

export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "BOOKING",
  RECEIVED: "ĐÃ NHẬN HÀNG",
  VOLUME_DONE: "ĐÃ ĐO VOLUME",
  CUSTOMS: "HẢI QUAN",
  SECURITY: "AN NINH",
  OLA_PULL: "KÉO OLA",
  RECEPTION_COMPLETED: "HOÀN THÀNH TIẾP NHẬN",
  WEIGH_SLIP: "NỘP TỜ CÂN",
  COMPLETED: "HOÀN THÀNH",
};

/** Card hàng — nền trắng/surface, viền trái màu trạng thái. */
export const statusRowBg = "bg-white dark:bg-dashboard-surface-dark";

export const statusRowAccent: Record<ShipmentStatus, string> = {
  PENDING: "border-l-2 border-l-blue-400/80 dark:border-l-blue-400/60",
  RECEIVED: "border-l-2 border-l-amber-400/80 dark:border-l-amber-400/60",
  VOLUME_DONE: "border-l-2 border-l-cyan-400/80 dark:border-l-cyan-400/60",
  CUSTOMS: "border-l-2 border-l-sky-500/80 dark:border-l-sky-500/60",
  SECURITY: "border-l-2 border-l-orange-400/80 dark:border-l-orange-400/60",
  OLA_PULL: "border-l-2 border-l-fuchsia-500/80 dark:border-l-fuchsia-500/60",
  RECEPTION_COMPLETED: "border-l-2 border-l-teal-500/80 dark:border-l-teal-500/60",
  WEIGH_SLIP: "border-l-2 border-l-lime-500/80 dark:border-l-lime-500/60",
  COMPLETED: "border-l-2 border-l-emerald-400/80 dark:border-l-emerald-400/60",
};

/** Hàng được chọn — tint amber nhẹ. */
export const statusRowSelected =
  "bg-amber-500/[0.04] ring-1 ring-amber-500/30 dark:bg-amber-500/[0.08] dark:ring-amber-400/20";

/** Dropdown trạng thái — nền tint 10% (translucent). */
export const statusSelectSurface: Record<ShipmentStatus, string> = {
  PENDING:
    "bg-blue-500/10 text-blue-600 border-blue-500/15 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/20",
  RECEIVED:
    "bg-amber-500/10 text-amber-700 border-amber-500/15 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20",
  VOLUME_DONE:
    "bg-cyan-500/10 text-cyan-700 border-cyan-500/15 dark:bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-400/20",
  CUSTOMS:
    "bg-sky-500/10 text-sky-700 border-sky-500/15 dark:bg-sky-400/10 dark:text-sky-300 dark:border-sky-400/20",
  SECURITY:
    "bg-orange-500/10 text-orange-700 border-orange-500/15 dark:bg-orange-400/10 dark:text-orange-300 dark:border-orange-400/20",
  OLA_PULL:
    "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/15 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:border-fuchsia-400/20",
  RECEPTION_COMPLETED:
    "bg-teal-500/10 text-teal-700 border-teal-500/15 dark:bg-teal-400/10 dark:text-teal-300 dark:border-teal-400/20",
  WEIGH_SLIP:
    "bg-lime-500/10 text-lime-700 border-lime-500/15 dark:bg-lime-400/10 dark:text-lime-300 dark:border-lime-400/20",
  COMPLETED:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/20",
};

/** Màu nhấn số hiệu chuyến bay. */
export const flightNumberAccent = "text-violet-700 dark:text-violet-300";
