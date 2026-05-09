import type { Shipment } from "../types/shipment";
import { LABEL_GAP_MM, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "../constants/labelDimensions";
import { mapShipmentToAirCargoLabelData } from "./mapShipmentToAirCargoLabelData";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";

/** Body JSON cho POST /api/tspl/build và /api/tspl/print */
export function shipmentToTsplBody(s: Shipment, airlineLabelOverrides?: AirlineLabelOverrides | null) {
  const label = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  return {
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
    gapMm: LABEL_GAP_MM,
    airlineLine1: label.airline,
    airlineLine2: "",
    awb: label.mawb,
    awbDigits: label.mawbDigits,
    origin: label.origin,
    dest: label.dest,
    pieces: label.pieces || "-",
    special: label.special,
  };
}
