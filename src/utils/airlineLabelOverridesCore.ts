import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX,
} from "../constants/airlineLabelDefaults";
import {
  emptyAirlineLabelOverrides,
  normalizeAirlineLabelOverridesLoose,
} from "../../shared/airlineLabelOverridesNormalize.mjs";

export type AirlineLabelOverrides = {
  /** 3 chữ số đầu AWB (vd "978") → tên hiển thị */
  byAwbPrefix: Record<string, string>;
  /** Prefix chuyến (vd "VJ", "VN") → tên hiển thị */
  byFlightPrefix: Record<string, string>;
};

export const EMPTY_AIRLINE_LABEL_OVERRIDES: AirlineLabelOverrides = emptyAirlineLabelOverrides();

/** Chuẩn hoá payload từ app / localStorage / API — nguồn: `shared/airlineLabelOverridesNormalize.mjs`. */
export function clampAirlineLabelOverrides(raw: unknown): AirlineLabelOverrides {
  return normalizeAirlineLabelOverridesLoose(raw);
}

export function mergeAirlineLookupMaps(
  overrides: AirlineLabelOverrides | undefined | null,
  opts?: { replaceDefaults?: boolean }
): {
  byAwb: Record<string, string>;
  byFlight: Record<string, string>;
} {
  const o = overrides ? clampAirlineLabelOverrides(overrides) : EMPTY_AIRLINE_LABEL_OVERRIDES;
  if (opts?.replaceDefaults) {
    return {
      byAwb: { ...o.byAwbPrefix },
      byFlight: { ...o.byFlightPrefix },
    };
  }
  return {
    byAwb: { ...DEFAULT_AIRLINE_BY_AWB_PREFIX, ...o.byAwbPrefix },
    byFlight: { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, ...o.byFlightPrefix },
  };
}
