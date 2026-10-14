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

/**
 * Badge trạng thái v4 — một nguồn token `st-*`.
 * Soft: PENDING, VOLUME_DONE, OLA_PULL. Solid: RECEIVED, WEIGH_SLIP.
 * Outline: RECEPTION_COMPLETED. Outline nét đứt: mã lịch sử.
 * Cờ ui.v2 không còn đổi bảng màu này.
 */
const STATUS_BADGE: Record<ShipmentStatus, string> = {
  PENDING: "border bg-st-pending-bg text-st-pending-fg border-st-pending-bar/40",
  RECEIVED: "border bg-st-received-bg text-st-received-fg border-st-received-bg",
  VOLUME_DONE: "border bg-st-volume-bg text-st-volume-fg border-st-volume-bar/35",
  OLA_PULL: "border bg-st-ola-bg text-st-ola-fg border-st-ola-bar/35",
  RECEPTION_COMPLETED: "border-[1.5px] bg-transparent text-st-reception-fg border-st-reception-border",
  WEIGH_SLIP: "border bg-st-weigh-bg text-st-weigh-fg border-st-weigh-bg",
  CUSTOMS: "border-[1.5px] border-dashed bg-transparent text-st-legacy-fg border-st-legacy-border",
  SECURITY: "border-[1.5px] border-dashed bg-transparent text-st-legacy-fg border-st-legacy-border",
  COMPLETED: "border-[1.5px] border-dashed bg-transparent text-st-legacy-fg border-st-legacy-border",
};

const STATUS_DOT: Record<ShipmentStatus, string> = {
  PENDING: "bg-st-pending-bar",
  RECEIVED: "bg-st-received-bar",
  VOLUME_DONE: "bg-st-volume-bar",
  OLA_PULL: "bg-st-ola-bar",
  RECEPTION_COMPLETED: "bg-st-reception-bar",
  WEIGH_SLIP: "bg-st-weigh-bar",
  CUSTOMS: "bg-st-legacy-bar",
  SECURITY: "bg-st-legacy-bar",
  COMPLETED: "bg-st-legacy-bar",
};

const STATUS_RING: Record<ShipmentStatus, string> = {
  PENDING: "ring-st-pending-bar",
  RECEIVED: "ring-st-received-bar",
  VOLUME_DONE: "ring-st-volume-bar",
  OLA_PULL: "ring-st-ola-bar",
  RECEPTION_COMPLETED: "ring-st-reception-bar",
  WEIGH_SLIP: "ring-st-weigh-bar",
  CUSTOMS: "ring-st-legacy-bar",
  SECURITY: "ring-st-legacy-bar",
  COMPLETED: "ring-st-legacy-bar",
};

const STATUS_BAR: Record<ShipmentStatus, string> = {
  PENDING: "before:bg-st-pending-bar",
  RECEIVED: "before:bg-st-received-bar",
  VOLUME_DONE: "before:bg-st-volume-bar",
  OLA_PULL: "before:bg-st-ola-bar",
  RECEPTION_COMPLETED: "before:bg-st-reception-bar",
  WEIGH_SLIP: "before:bg-st-weigh-bar",
  CUSTOMS: "before:bg-st-legacy-bar",
  SECURITY: "before:bg-st-legacy-bar",
  COMPLETED: "before:bg-st-legacy-bar",
};

const STATUS_ROW: Record<ShipmentStatus, string> = {
  PENDING: "border-l-[3px] border-l-st-pending-bar",
  RECEIVED: "border-l-[3px] border-l-st-received-bar",
  VOLUME_DONE: "border-l-[3px] border-l-st-volume-bar",
  OLA_PULL: "border-l-[3px] border-l-st-ola-bar",
  RECEPTION_COMPLETED: "border-l-[3px] border-l-st-reception-bar",
  WEIGH_SLIP: "border-l-[3px] border-l-st-weigh-bar",
  CUSTOMS: "border-l-[3px] border-l-st-legacy-bar",
  SECURITY: "border-l-[3px] border-l-st-legacy-bar",
  COMPLETED: "border-l-[3px] border-l-st-legacy-bar",
};

export const statusBadgeClass = STATUS_BADGE;
export const statusDotClass = STATUS_DOT;
export const statusRingClass = STATUS_RING;
export const statusBarClass = STATUS_BAR;
export const statusRowAccent = STATUS_ROW;

/** "3/6" theo workflow kho; null nếu mã lịch sử. */
export function statusStep(status: ShipmentStatus, warehouse: Warehouse): { n: number; of: number } | null {
  const order = statusOrderForWarehouse(warehouse);
  const i = order.indexOf(status);
  return i < 0 ? null : { n: i + 1, of: order.length };
}

/** Card hàng — viền trái màu trạng thái + surface phẳng. */
export const statusRowBg = "bg-ui-surface";

/** Hàng được chọn — tint teal nhẹ Round 2. */
export const statusRowSelected = "bg-teal-500/[0.08] ring-1 ring-teal-600/35";

/** Dropdown / pill trạng thái — tương thích ngược với code cũ, dùng statusBadgeClass. */
export const statusSelectSurface: Record<ShipmentStatus, string> = statusBadgeClass;

/** Số hiệu chuyến: mực, mono 600 — không hue. */
export const flightNumberAccent = "font-mono font-semibold text-ui-text";
