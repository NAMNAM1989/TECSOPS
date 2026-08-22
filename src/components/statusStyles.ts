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

/** Hàng được chọn — tint teal nhẹ Round 2. */
export const statusRowSelected = "bg-teal-500/[0.08] ring-1 ring-teal-600/35";

/** Dropdown / pill trạng thái — nền tint + chữ tương phản (Round 2). */
export const statusSelectSurface: Record<ShipmentStatus, string> = {
  PENDING: "bg-blue-50 text-blue-900 border-blue-200/90",
  RECEIVED: "bg-amber-50 text-amber-950 border-amber-200/90",
  VOLUME_DONE: "bg-cyan-50 text-cyan-950 border-cyan-200/90",
  CUSTOMS: "bg-sky-50 text-sky-950 border-sky-200/90",
  SECURITY: "bg-orange-50 text-orange-950 border-orange-200/90",
  OLA_PULL: "bg-fuchsia-50 text-fuchsia-950 border-fuchsia-200/90",
  RECEPTION_COMPLETED: "bg-teal-50 text-teal-950 border-teal-200/90",
  WEIGH_SLIP: "bg-lime-50 text-lime-950 border-lime-200/90",
  COMPLETED: "bg-emerald-50 text-emerald-950 border-emerald-200/90",
};

/** Màu nhấn số hiệu chuyến bay. */
export const flightNumberAccent = "text-violet-900";
