import type { ShipmentStatus } from "../types/shipment";

export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "BOOKING",
  RECEIVED: "Đã nhận",
  AT_RISK: "Sắp trễ",
  CUTOFF_PASSED: "Hàng gấp",
  BUILT_UP: "Đã xong",
  DEPARTED: "Đã kéo OLA",
  DELIVERED: "Hoàn thành",
};

/** Nền hàng: tint nhẹ kiểu Apple, vạch trái rõ để quét nhanh */
export const statusRowBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-amber-50/80",
  RECEIVED: "bg-emerald-50/70",
  AT_RISK: "bg-orange-50/80",
  CUTOFF_PASSED: "bg-red-50/80",
  BUILT_UP: "bg-sky-50/70",
  DEPARTED: "bg-violet-50/70",
  DELIVERED: "bg-neutral-100/80",
};

export const statusRowBorder: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-amber-400",
  RECEIVED: "border-l-[3px] border-l-emerald-500",
  AT_RISK: "border-l-[3px] border-l-orange-500",
  CUTOFF_PASSED: "border-l-[3px] border-l-red-500",
  BUILT_UP: "border-l-[3px] border-l-sky-500",
  DEPARTED: "border-l-[3px] border-l-violet-500",
  DELIVERED: "border-l-[3px] border-l-neutral-400",
};

/** Pill trạng thái — chữ đậm vừa, bo đầy */
export const statusBadge: Record<ShipmentStatus, string> = {
  PENDING: "bg-amber-100/90 text-amber-950 font-semibold",
  RECEIVED: "bg-emerald-100/90 text-emerald-900 font-semibold",
  AT_RISK: "bg-orange-100/90 text-orange-900 font-semibold",
  CUTOFF_PASSED: "bg-red-100/90 text-red-900 font-semibold",
  BUILT_UP: "bg-sky-100/90 text-sky-900 font-semibold",
  DEPARTED: "bg-violet-100/90 text-violet-900 font-semibold",
  DELIVERED: "bg-neutral-200/90 text-neutral-800 font-semibold",
};

export const statusCardBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-amber-50/90 border-amber-200/60",
  RECEIVED: "bg-emerald-50/90 border-emerald-200/50",
  AT_RISK: "bg-orange-50/90 border-orange-200/60",
  CUTOFF_PASSED: "bg-red-50/90 border-red-200/60",
  BUILT_UP: "bg-sky-50/90 border-sky-200/50",
  DEPARTED: "bg-violet-50/90 border-violet-200/50",
  DELIVERED: "bg-neutral-100/90 border-neutral-200/60",
};
