import type { Shipment } from "../types/shipment";
import { LABEL_GAP_MM, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "../constants/labelDimensions";
import { formatAwb, rawAwbDigits } from "./awbFormat";

export function airlineLines(flight: string): [string, string] {
  const t = flight.trim().toUpperCase();
  const prefix = t.match(/^([A-Z]{2,3})/)?.[1] ?? (t.slice(0, 3) || "AIR");
  return [`${prefix} AIRLINES`, "CARGO"];
}

/** Body JSON cho POST /api/tspl/build và /api/tspl/print */
export function shipmentToTsplBody(s: Shipment) {
  const [airlineLine1, airlineLine2] = airlineLines(s.flight);
  return {
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
    gapMm: LABEL_GAP_MM,
    airlineLine1,
    airlineLine2,
    awb: formatAwb(s.awb),
    awbDigits: rawAwbDigits(s.awb),
    origin: "SGN",
    dest: s.dest,
    pieces: s.pcs != null ? String(s.pcs) : "—",
  };
}
