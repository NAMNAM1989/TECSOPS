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

/** Nền hàng bàn desktop — mỗi trạng thái một tông màu rõ rệt */
export const statusRowBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-slate-50/95",
  RECEIVED: "bg-amber-100/90",
  VOLUME_DONE: "bg-cyan-100/90",
  CUSTOMS: "bg-blue-100/90",
  SECURITY: "bg-orange-100/90",
  OLA_PULL: "bg-fuchsia-100/90",
  WEIGH_SLIP: "bg-lime-100/90",
  COMPLETED: "bg-emerald-200/90",
};

export const statusRowBorder: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[4px] border-l-slate-500",
  RECEIVED: "border-l-[4px] border-l-amber-600",
  VOLUME_DONE: "border-l-[4px] border-l-cyan-600",
  CUSTOMS: "border-l-[4px] border-l-blue-700",
  SECURITY: "border-l-[4px] border-l-orange-600",
  OLA_PULL: "border-l-[4px] border-l-fuchsia-700",
  WEIGH_SLIP: "border-l-[4px] border-l-lime-600",
  COMPLETED: "border-l-[4px] border-l-emerald-700",
};

/** Pill / select trạng thái — tương phản cao để dễ quét mắt */
export const statusBadge: Record<ShipmentStatus, string> = {
  PENDING: "bg-slate-200 text-slate-950 ring-2 ring-inset ring-slate-400/80 font-bold",
  RECEIVED: "bg-amber-400 text-amber-950 ring-2 ring-inset ring-amber-700/50 font-bold",
  VOLUME_DONE: "bg-cyan-400 text-cyan-950 ring-2 ring-inset ring-cyan-700/50 font-bold",
  CUSTOMS: "bg-blue-600 text-white ring-2 ring-inset ring-blue-900/40 font-bold",
  SECURITY: "bg-orange-500 text-white ring-2 ring-inset ring-orange-900/35 font-bold",
  OLA_PULL: "bg-fuchsia-600 text-white ring-2 ring-inset ring-fuchsia-950/40 font-bold",
  WEIGH_SLIP: "bg-lime-500 text-lime-950 ring-2 ring-inset ring-lime-800/45 font-bold",
  COMPLETED: "bg-emerald-600 text-white ring-2 ring-inset ring-emerald-950/40 font-bold",
};

/** Thẻ mobile */
export const statusCardBg: Record<ShipmentStatus, string> = {
  PENDING: "bg-slate-50/95 border-slate-400/80",
  RECEIVED: "bg-amber-50/95 border-amber-500/80",
  VOLUME_DONE: "bg-cyan-50/95 border-cyan-500/80",
  CUSTOMS: "bg-blue-50/95 border-blue-600/80",
  SECURITY: "bg-orange-50/95 border-orange-500/80",
  OLA_PULL: "bg-fuchsia-50/95 border-fuchsia-500/80",
  WEIGH_SLIP: "bg-lime-50/95 border-lime-600/80",
  COMPLETED: "bg-emerald-100/95 border-emerald-600/80",
};
