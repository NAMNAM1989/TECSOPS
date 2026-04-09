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

/** Nền hàng bàn desktop — theo bảng màu nghiệp vụ */
export const statusRowBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-white",
  RECEIVED: "bg-yellow-50/95",
  AT_RISK: "bg-red-50/95",
  CUTOFF_PASSED: "bg-orange-50/95",
  BUILT_UP: "bg-emerald-50/95",
  DEPARTED: "bg-violet-50/95",
  DELIVERED: "bg-sky-50/95",
};

export const statusRowBorder: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-slate-300",
  RECEIVED: "border-l-[3px] border-l-yellow-500",
  AT_RISK: "border-l-[3px] border-l-red-600",
  CUTOFF_PASSED: "border-l-[3px] border-l-orange-500",
  BUILT_UP: "border-l-[3px] border-l-emerald-600",
  DEPARTED: "border-l-[3px] border-l-violet-600",
  DELIVERED: "border-l-[3px] border-l-sky-600",
};

/** Pill / select trạng thái */
export const statusBadge: Record<ShipmentStatus, string> = {
  PENDING: "bg-white text-slate-800 ring-1 ring-inset ring-slate-200 font-semibold",
  RECEIVED: "bg-yellow-100/95 text-yellow-950 font-semibold",
  AT_RISK: "bg-red-100/95 text-red-900 font-semibold",
  CUTOFF_PASSED: "bg-orange-100/95 text-orange-950 font-semibold",
  BUILT_UP: "bg-emerald-100/95 text-emerald-950 font-semibold",
  DEPARTED: "bg-violet-100/95 text-violet-950 font-semibold",
  DELIVERED: "bg-sky-100/95 text-sky-950 font-semibold",
};

/** Thẻ mobile */
export const statusCardBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-white border-slate-200/90",
  RECEIVED: "bg-yellow-50/95 border-yellow-300/70",
  AT_RISK: "bg-red-50/95 border-red-300/70",
  CUTOFF_PASSED: "bg-orange-50/95 border-orange-300/70",
  BUILT_UP: "bg-emerald-50/95 border-emerald-300/70",
  DEPARTED: "bg-violet-50/95 border-violet-300/70",
  DELIVERED: "bg-sky-50/95 border-sky-300/70",
};
