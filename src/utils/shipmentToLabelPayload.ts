import type { Shipment } from "../types/shipment";
import { LABEL_GAP_MM, LABEL_HEIGHT_MM, LABEL_WIDTH_MM } from "../constants/labelDimensions";
import { mapShipmentToAirCargoLabelData } from "./mapShipmentToAirCargoLabelData";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import type { ThermalLabelPrinterProfile } from "../printing/printTypes";
import { getActiveThermalProfile } from "../printing/printerProfiles";
import { loadPrinterProfileStore } from "../printing/printerProfileStorage";

/** Body JSON cho POST /api/tspl/build và /api/tspl/print */
export function shipmentToTsplBody(
  s: Shipment,
  airlineLabelOverrides?: AirlineLabelOverrides | null,
  profile?: ThermalLabelPrinterProfile
) {
  const store = loadPrinterProfileStore();
  const p = profile ?? getActiveThermalProfile(store);
  const label = mapShipmentToAirCargoLabelData(s, airlineLabelOverrides);
  const airline = label.airline.trim();
  const splitAt = airline.length > 28 ? airline.lastIndexOf(" ", 28) : -1;
  const airlineLine1 = splitAt > 8 ? airline.slice(0, splitAt).trim() : airline;
  const airlineLine2 = splitAt > 8 ? airline.slice(splitAt).trim() : "";
  return {
    widthMm: p.labelWidthMm ?? LABEL_WIDTH_MM,
    heightMm: p.labelHeightMm ?? LABEL_HEIGHT_MM,
    gapMm: p.gapMm ?? LABEL_GAP_MM,
    dpi: p.dpi,
    offsetXmm: p.offsetXmm,
    offsetYmm: p.offsetYmm,
    rotation: p.rotation,
    speed: p.speed,
    density: p.density,
    copies: p.copiesDefault,
    airlineLine1,
    airlineLine2,
    awb: label.mawb,
    awbDigits: label.mawbDigits,
    origin: label.origin,
    dest: label.dest,
    pieces: label.pieces || "-",
    special: label.special,
  };
}
