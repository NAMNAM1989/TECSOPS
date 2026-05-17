import type { Shipment } from "../../types/shipment";
import type { AirlineLabelOverrides } from "../../utils/airlineLabelOverridesCore";
import { mapShipmentToAirCargoLabelData } from "../../utils/mapShipmentToAirCargoLabelData";
import { buildThermalLabelSlotValues } from "../../printing/thermalLabel/thermalLabelValues";
import type { LabelDataContext } from "../core/types";

export function buildShipmentLabelContext(
  shipment: Shipment,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): LabelDataContext {
  const d = mapShipmentToAirCargoLabelData(shipment, airlineLabelOverrides);
  const pack = buildThermalLabelSlotValues(shipment, airlineLabelOverrides);
  const v = pack.values;

  return {
    airline: d.airline,
    airlineLine1: v.airlineLine1 ?? "",
    airlineLine2: v.airlineLine2 ?? "",
    mawb: d.mawb,
    awb: shipment.awb,
    awbDigits: d.mawbDigits,
    origin: d.origin,
    dest: d.dest,
    pieces: d.pieces,
    piecesHawb: d.hawbPieces,
    piecesMawb: d.pieces,
    hasHawb: d.hasHawb,
    "!hasHawb": !d.hasHawb,
    hawbNo: d.hawbNo,
    hawbLine: v.hawbLine ?? "",
    customer: shipment.customer,
    flight: shipment.flight ?? "",
    special: d.special,
  };
}
