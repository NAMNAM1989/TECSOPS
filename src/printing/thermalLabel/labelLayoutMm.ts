/**
 * Tọa độ tem 100×80 mm (đọc chữ đứng) — dùng chung cho TSPL và tài liệu căn chỉnh.
 * Preview HTML dùng flex trong print-label.css; TSPL dùng tọa độ tuyệt đối dưới đây.
 */
export type LabelTextSlot = { x: number; y: number; font?: string; mulX?: number; mulY?: number };

export const THERMAL_LABEL_LAYOUT_100x80 = {
  airlineLine1: { x: 2, y: 2, font: "4", mulX: 1, mulY: 1 },
  airlineLine2: { x: 2, y: 7, font: "4", mulX: 1, mulY: 1 },
  mawb: { x: 2, y: 12, font: "4", mulX: 2, mulY: 2 },
  originLabel: { x: 2, y: 22, font: "3", mulX: 1, mulY: 1 },
  origin: { x: 2, y: 26, font: "4", mulX: 1, mulY: 1 },
  destLabel: { x: 52, y: 22, font: "3", mulX: 1, mulY: 1 },
  dest: { x: 52, y: 26, font: "4", mulX: 1, mulY: 1 },
  barcode: { x: 2, y: 36, heightMm: 8 },
  piecesLabel: { x: 2, y: 68, font: "3", mulX: 1, mulY: 1 },
  pieces: { x: 58, y: 62, font: "4", mulX: 2, mulY: 2 },
} as const;
