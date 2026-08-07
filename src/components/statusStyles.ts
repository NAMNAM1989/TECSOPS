import type { ShipmentStatus } from "../types/shipment";

/** Nhãn theo spec §5.6 — OLA giữ viết hoa nghiệp vụ (viết tắt). */
export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "Booking",
  /** Nhãn quick filter Ops — «Hàng mới tiếp nhận». */
  RECEIVED: "Hàng mới tiếp nhận",
  VOLUME_DONE: "Đã đo Volume",
  CUSTOMS: "Hải quan",
  SECURITY: "An ninh",
  OLA_PULL: "Kéo OLA",
  /** Nhãn quick filter Ops — «Đã hoàn thành tiếp nhận». */
  RECEPTION_COMPLETED: "Đã hoàn thành tiếp nhận",
  WEIGH_SLIP: "Nộp tờ cân",
  COMPLETED: "Hoàn thành",
};

/** Nhãn ngắn cho dropdown trạng thái hàng (giữ gọn hơn chip lọc). */
export const statusLabelShort: Record<ShipmentStatus, string> = {
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
  PENDING: "border-l-2 border-l-blue-500",
  RECEIVED: "border-l-2 border-l-amber-500",
  VOLUME_DONE: "border-l-2 border-l-cyan-500",
  CUSTOMS: "border-l-2 border-l-sky-500",
  SECURITY: "border-l-2 border-l-orange-500",
  OLA_PULL: "border-l-2 border-l-fuchsia-500",
  RECEPTION_COMPLETED: "border-l-2 border-l-teal-600",
  WEIGH_SLIP: "border-l-2 border-l-lime-600",
  COMPLETED: "border-l-2 border-l-emerald-500",
};

/** Hàng được chọn — tint amber nhẹ. */
export const statusRowSelected = "bg-amber-500/[0.06] ring-1 ring-amber-500/35";

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
