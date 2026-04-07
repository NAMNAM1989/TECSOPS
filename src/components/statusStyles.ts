import type { ShipmentStatus } from "../types/shipment";

export const statusLabel: Record<ShipmentStatus, string> = {
  PENDING: "Chờ hàng",
  RECEIVED: "Đã nhận",
  AT_RISK: "Sắp trễ",
  CUTOFF_PASSED: "Quá giờ",
  BUILT_UP: "Đã đóng",
  DEPARTED: "Đã bay",
  DELIVERED: "Đã giao",
};

/*
  Bảng màu nóng, dễ phân biệt bằng mắt từ xa:
  ● Chờ hàng   → VÀNG
  ● Đã nhận    → XANH LÁ
  ● Sắp trễ    → CAM
  ● Quá giờ    → ĐỎ
  ● Đã đóng    → XANH DƯƠNG
  ● Đã bay     → TÍM
  ● Đã giao    → XÁM (hoàn tất)
*/

export const statusRowBg: Record<ShipmentStatus, string> = {
  PENDING:       "bg-yellow-100",
  RECEIVED:      "bg-green-100",
  AT_RISK:       "bg-orange-100",
  CUTOFF_PASSED: "bg-red-100",
  BUILT_UP:      "bg-blue-100",
  DEPARTED:      "bg-violet-100",
  DELIVERED:     "bg-gray-100",
};

export const statusRowBorder: Record<ShipmentStatus, string> = {
  PENDING:       "border-l-4 border-l-yellow-400",
  RECEIVED:      "border-l-4 border-l-green-500",
  AT_RISK:       "border-l-4 border-l-orange-500",
  CUTOFF_PASSED: "border-l-4 border-l-red-500",
  BUILT_UP:      "border-l-4 border-l-blue-500",
  DEPARTED:      "border-l-4 border-l-violet-500",
  DELIVERED:     "border-l-4 border-l-gray-400",
};

export const statusBadge: Record<ShipmentStatus, string> = {
  PENDING:
    "bg-yellow-400 text-yellow-950 ring-1 ring-yellow-500 font-bold",
  RECEIVED:
    "bg-green-500 text-white ring-1 ring-green-600 font-bold",
  AT_RISK:
    "bg-orange-500 text-white ring-1 ring-orange-600 font-extrabold",
  CUTOFF_PASSED:
    "bg-red-600 text-white ring-1 ring-red-700 font-extrabold",
  BUILT_UP:
    "bg-blue-500 text-white ring-1 ring-blue-600 font-bold",
  DEPARTED:
    "bg-violet-500 text-white ring-1 ring-violet-600 font-bold",
  DELIVERED:
    "bg-gray-400 text-white ring-1 ring-gray-500 font-bold",
};

export const statusCardBg: Record<ShipmentStatus, string> = {
  PENDING:       "bg-yellow-50 border-yellow-300",
  RECEIVED:      "bg-green-50 border-green-300",
  AT_RISK:       "bg-orange-50 border-orange-400",
  CUTOFF_PASSED: "bg-red-50 border-red-400",
  BUILT_UP:      "bg-blue-50 border-blue-300",
  DEPARTED:      "bg-violet-50 border-violet-300",
  DELIVERED:     "bg-gray-50 border-gray-300",
};
