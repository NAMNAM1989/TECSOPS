import type { Shipment } from "../types/shipment";
import { formatAwb, rawAwbDigits } from "./awbFormat";
import type { AirlineLabelOverrides } from "./airlineLabelOverridesCore";
import { mergeAirlineLookupMaps } from "./airlineLabelOverridesCore";

export type AirCargoLabelData = {
  airline: string;
  mawb: string;
  mawbDigits: string;
  origin: string;
  dest: string;
  pieces: string;
};

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Prefix hãng từ cột chuyến (vd. VN773 → VN, 5J123 → 5J, AK523/14JUL → AK).
 * Ưu tiên khớp 2–3 ký tự có trong bảng; mặc định lấy 2 ký tự IATA.
 */
export function extractFlightAirlinePrefix(
  flight: string,
  knownPrefixes?: ReadonlySet<string> | Record<string, string>
): string {
  const raw = compact(flight).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length < 2) return "";

  const known =
    knownPrefixes instanceof Set
      ? knownPrefixes
      : knownPrefixes
        ? new Set(Object.keys(knownPrefixes))
        : null;

  const three = raw.slice(0, 3);
  const two = raw.slice(0, 2);
  if (known?.has(three)) return three;
  if (known?.has(two)) return two;
  // Designator số+chữ kiểu 5J / 3U — lấy 2 ký tự
  if (/^[0-9][A-Z]/.test(two)) return two;
  if (known === null && /^[A-Z]{3}/.test(three) && !/^[A-Z]{2}\d/.test(raw)) {
    // Hiếm: mã 3 chữ không kèm số chuyến
    return three;
  }
  return two;
}

function airlineNameFromShipment(s: Shipment, maps: ReturnType<typeof mergeAirlineLookupMaps>): string {
  const { byAwb, byFlight } = maps;

  // Tem nhãn: ưu tiên prefix cột chuyến bay
  const flightPrefix = extractFlightAirlinePrefix(s.flight, byFlight);
  if (flightPrefix && byFlight[flightPrefix]) return byFlight[flightPrefix];

  // Fallback: 3 số đầu AWB nếu không suy được từ chuyến
  const awbPrefix = rawAwbDigits(s.awb).slice(0, 3);
  if (awbPrefix.length === 3 && byAwb[awbPrefix]) return byAwb[awbPrefix];

  return flightPrefix ? `${flightPrefix} AIRLINES` : "";
}

export function mapShipmentToAirCargoLabelData(
  s: Shipment,
  airlineLabelOverrides?: AirlineLabelOverrides | null
): AirCargoLabelData {
  const maps = mergeAirlineLookupMaps(airlineLabelOverrides ?? undefined);
  const pieces = s.pcs != null && s.pcs > 0 ? String(s.pcs) : "";
  return {
    airline: airlineNameFromShipment(s, maps),
    mawb: formatAwb(s.awb),
    mawbDigits: rawAwbDigits(s.awb),
    origin: "SGN",
    dest: compact(s.dest).toUpperCase(),
    pieces,
  };
}
