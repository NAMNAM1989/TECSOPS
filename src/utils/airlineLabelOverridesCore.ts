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

function trimName(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function mergeAirlineLookupMaps(overrides: AirlineLabelOverrides | undefined | null): {
  byAwb: Record<string, string>;
  byFlight: Record<string, string>;
} {
  const o = overrides ? clampAirlineLabelOverrides(overrides) : EMPTY_AIRLINE_LABEL_OVERRIDES;
  return {
    byAwb: { ...DEFAULT_AIRLINE_BY_AWB_PREFIX, ...o.byAwbPrefix },
    byFlight: { ...DEFAULT_AIRLINE_BY_FLIGHT_PREFIX, ...o.byFlightPrefix },
  };
}

/**
 * Từ bản đầy đủ đang chỉnh trong UI (đã gộp mặc định + hiển thị),
 * tính payload chỉ gồm các key có tên khác bảng mặc định trong code.
 */
export function overridesFromEffectiveMaps(
  effectiveAwb: Record<string, string>,
  effectiveFlight: Record<string, string>
): AirlineLabelOverrides {
  const byAwbPrefix: Record<string, string> = {};
  for (const [k, v] of Object.entries(effectiveAwb)) {
    const key = String(k).replace(/\D/g, "").slice(0, 3).padStart(3, "0");
    if (!/^\d{3}$/.test(key)) continue;
    const name = trimName(String(v ?? ""));
    if (!name) continue;
    if (DEFAULT_AIRLINE_BY_AWB_PREFIX[key] !== name) {
      byAwbPrefix[key] = name;
    }
  }

  const byFlightPrefix: Record<string, string> = {};
  for (const [k, v] of Object.entries(effectiveFlight)) {
    const key = String(k).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    if (key.length < 2) continue;
    const name = trimName(String(v ?? ""));
    if (!name) continue;
    const def = DEFAULT_AIRLINE_BY_FLIGHT_PREFIX[key];
    if (def !== name) {
      byFlightPrefix[key] = name;
    }
  }

  return clampAirlineLabelOverrides({ byAwbPrefix, byFlightPrefix });
}
