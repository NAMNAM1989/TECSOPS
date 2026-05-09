import type { Shipment } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "./awbFormat";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { mergeAirlineLookupMaps } from "./airlineLabelOverridesCore";

export type AirCargoLabelSpecial = "" | "cold" | "danger";

export type AirCargoLabelData = {
  airline: string;
  mawb: string;
  mawbDigits: string;
  origin: string;
  dest: string;
  pieces: string;
  hasHawb: boolean;
  hawbNo: string;
  hawbPieces: string;
  special: AirCargoLabelSpecial;
};

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function airlineNameFromShipment(s: Shipment, maps: ReturnType<typeof mergeAirlineLookupMaps>): string {
  const { byAwb, byFlight } = maps;
  const awbPrefix = rawAwbDigits(s.awb).slice(0, 3);
  if (awbPrefix.length === 3 && byAwb[awbPrefix]) return byAwb[awbPrefix];

  const flightPrefix = compact(s.flight).toUpperCase().match(/^[A-Z0-9]{2,3}/)?.[0] ?? "";
  if (flightPrefix && byFlight[flightPrefix]) return byFlight[flightPrefix];
  const twoCharPrefix = flightPrefix.slice(0, 2);
  if (twoCharPrefix && byFlight[twoCharPrefix]) return byFlight[twoCharPrefix];
  return flightPrefix ? `${flightPrefix} AIRLINES` : "";
}

function specialFromShipment(s: Shipment): AirCargoLabelSpecial {
  const text = `${s.note ?? ""} ${s.cutoffNote ?? ""}`.toUpperCase();
  if (/(DG|DANGEROUS|BATTERY|LITHIUM|CHEMICAL)/.test(text)) return "danger";
  if (/(PER|PERISHABLE|COLD|COOL|2-8|2–8|FRESH|KEEP)/.test(text)) return "cold";
  return "";
}

export function mapShipmentToAirCargoLabelData(
  s: Shipment,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): AirCargoLabelData {
  const maps = mergeAirlineLookupMaps(airlineLabelOverrides ?? undefined);
  const pieces = s.pcs != null && s.pcs > 0 ? String(s.pcs) : "";
  const hawbNo = compact(s.hawb ?? "");
  const hasHawb = hawbNo.length > 0;
  return {
    airline: airlineNameFromShipment(s, maps),
    mawb: formatAwb(s.awb),
    mawbDigits: rawAwbDigits(s.awb),
    origin: "SGN",
    dest: compact(s.dest).toUpperCase(),
    pieces,
    hasHawb,
    hawbNo,
    hawbPieces: hasHawb ? pieces : "",
    special: specialFromShipment(s),
  };
}
