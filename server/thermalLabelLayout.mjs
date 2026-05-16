/** Mirror `src/printing/thermalLabel/labelLayoutMm.ts` — giữ đồng bộ khi đổi layout. */
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
};
