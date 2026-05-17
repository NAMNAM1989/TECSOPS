import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { mapShipmentToAirCargoLabelData } from "../../utils/mapShipmentToAirCargoLabelData";

export type ThermalLabelSlotValues = Record<string, string>;

/** Nội dung từng ô tem theo lô (preview + TSPL). */
export function buildThermalLabelSlotValues(
  shipment: Shipment,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): { values: ThermalLabelSlotValues; hasHawb: boolean; awbDigits: string } {
  const d = mapShipmentToAirCargoLabelData(shipment, airlineLabelOverrides);
  const airline = d.airline.trim();
  const splitAt = airline.length > 28 ? airline.lastIndexOf(" ", 28) : -1;
  const airlineLine1 = splitAt > 8 ? airline.slice(0, splitAt).trim() : airline;
  const airlineLine2 = splitAt > 8 ? airline.slice(splitAt).trim() : "";

  const values: ThermalLabelSlotValues = {
    airlineLine1,
    airlineLine2,
    mawb: d.mawb,
    originLabel: "Origin",
    origin: d.origin,
    destLabel: "Destination",
    dest: d.dest,
    hawbLine: d.hasHawb ? `HAWB  ${d.hawbNo}` : "",
    piecesLabel: "Total no. of pieces",
    pieces: d.pieces,
    piecesHawbLabel: "Pieces · HAWB",
    piecesHawb: d.hawbPieces,
    piecesMawbLabel: "Total · MAWB",
    piecesMawb: d.pieces,
  };

  return { values, hasHawb: d.hasHawb, awbDigits: d.mawbDigits };
}

export type ThermalLabelValuePack = ReturnType<typeof buildThermalLabelSlotValues>;
