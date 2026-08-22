import type { ShipmentStatus } from "../types/shipment";

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

/** Card hàng — viền trái màu trạng thái + surface phẳng. */
export const statusRowBg = "bg-ui-surface";

export const statusRowAccent: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-blue-500",
  RECEIVED: "border-l-[3px] border-l-amber-500",
  VOLUME_DONE: "border-l-[3px] border-l-cyan-500",
  CUSTOMS: "border-l-[3px] border-l-sky-500",
  SECURITY: "border-l-[3px] border-l-orange-500",
  OLA_PULL: "border-l-[3px] border-l-fuchsia-500",
  RECEPTION_COMPLETED: "border-l-[3px] border-l-teal-600",
  WEIGH_SLIP: "border-l-[3px] border-l-lime-600",
  COMPLETED: "border-l-[3px] border-l-emerald-500",
};

/** Hàng được chọn — tint amber nhẹ. */
export const statusRowSelected = "bg-amber-500/[0.07] ring-1 ring-amber-500/40";

/** Dropdown trạng thái — nền tint + chữ tương phản (light). */
export const statusSelectSurface: Record<ShipmentStatus, string> = {
  PENDING: "bg-blue-500/10 text-blue-800 border-blue-500/20",
  RECEIVED: "bg-amber-500/10 text-amber-900 border-amber-500/20",
  VOLUME_DONE: "bg-cyan-500/10 text-cyan-900 border-cyan-500/20",
  CUSTOMS: "bg-sky-500/10 text-sky-900 border-sky-500/20",
  SECURITY: "bg-orange-500/10 text-orange-900 border-orange-500/20",
  OLA_PULL: "bg-fuchsia-500/10 text-fuchsia-900 border-fuchsia-500/20",
  RECEPTION_COMPLETED: "bg-teal-500/10 text-teal-900 border-teal-500/20",
  WEIGH_SLIP: "bg-lime-500/10 text-lime-900 border-lime-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-900 border-emerald-500/20",
};

/** Màu nhấn số hiệu chuyến bay. */
export const flightNumberAccent = "text-violet-800";
