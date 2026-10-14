import type { Warehouse } from "../types/shipment";

/** Series biểu đồ — light v4, gán theo mã kho. */
export const warehouseSeriesHex: Record<Warehouse, string> = {
  "TECS-TCS": "#0C4A6E",
  TCS: "#0369A1",
  "TECS-SCSC": "#4C1D95",
  SCSC: "#6D28D9",
};

export type WarehouseTone = {
  surface: string;
  text: string;
  border: string;
  bar: string;
  ring: string;
  chip: string;
};

/** Hub nền đặc, partner nền nhạt + viền. Cùng họ màu, khác độ sáng. */
export const warehouseTone: Record<Warehouse, WarehouseTone> = {
  "TECS-TCS": {
    surface: "bg-whc-tecs-tcs-bg",
    text: "text-whc-tecs-tcs-fg",
    border: "border-whc-tecs-tcs-border",
    bar: "border-l-whc-tecs-tcs-series",
    ring: "ring-whc-tecs-tcs-series",
    chip: "bg-whc-tecs-tcs-bg text-whc-tecs-tcs-fg ring-whc-tecs-tcs-border",
  },
  TCS: {
    surface: "bg-whc-tcs-bg",
    text: "text-whc-tcs-fg",
    border: "border-whc-tcs-border",
    bar: "border-l-whc-tcs-series",
    ring: "ring-whc-tcs-series",
    chip: "bg-whc-tcs-bg text-whc-tcs-fg ring-whc-tcs-border",
  },
  "TECS-SCSC": {
    surface: "bg-whc-tecs-scsc-bg",
    text: "text-whc-tecs-scsc-fg",
    border: "border-whc-tecs-scsc-border",
    bar: "border-l-whc-tecs-scsc-series",
    ring: "ring-whc-tecs-scsc-series",
    chip: "bg-whc-tecs-scsc-bg text-whc-tecs-scsc-fg ring-whc-tecs-scsc-border",
  },
  SCSC: {
    surface: "bg-whc-scsc-bg",
    text: "text-whc-scsc-fg",
    border: "border-whc-scsc-border",
    bar: "border-l-whc-scsc-series",
    ring: "ring-whc-scsc-series",
    chip: "bg-whc-scsc-bg text-whc-scsc-fg ring-whc-scsc-border",
  },
};

export function warehouseSeriesFor(code: string): string {
  if (code in warehouseSeriesHex) return warehouseSeriesHex[code as Warehouse];
  return "#64748B";
}
