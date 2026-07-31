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

/** Tên hiển thị khi chưa có trong bảng mặc định / ghi đè — khớp tem in. */
export function syntheticAirlineLabelName(prefix: string): string {
  const key = String(prefix)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  return key ? `${key} AIRLINES` : "";
}

export function normalizeFlightPrefixKey(raw: string): string {
  return String(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
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
 * Bản đồ prefix → tên dùng trong UI «Tên hãng trên tem».
 * Gồm mặc định + ghi đè + prefix đang có trên các lô (để sửa TR… khớp với tem).
 */
export function buildFlightLabelMapForEditor(
  overrides: AirlineLabelOverrides | undefined | null,
  flightSamples: readonly string[] = []
): Record<string, string> {
  const { byFlight } = mergeAirlineLookupMaps(overrides);
  const out: Record<string, string> = { ...byFlight };

  for (const sample of flightSamples) {
    const raw = String(sample ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (raw.length < 2) continue;

    // Khớp cùng quy tắc extract: ưu tiên 3 rồi 2 ký tự nếu đã có trong bảng.
    const three = raw.slice(0, 3);
    const two = raw.slice(0, 2);
    let key = "";
    if (three.length === 3 && three in out) key = three;
    else if (two in out) key = two;
    else if (/^[0-9][A-Z]/.test(two)) key = two;
    else key = two;

    if (key.length < 2 || key in out) continue;
    out[key] = syntheticAirlineLabelName(key);
  }

  return out;
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
    const key = normalizeFlightPrefixKey(k);
    if (key.length < 2) continue;
    const name = trimName(String(v ?? ""));
    if (!name) continue;
    const def = DEFAULT_AIRLINE_BY_FLIGHT_PREFIX[key];
    // Không lưu fallback tổng hợp «XX AIRLINES» khi chưa có trong bảng gốc.
    if (def === undefined && name === syntheticAirlineLabelName(key)) continue;
    if (def !== name) {
      byFlightPrefix[key] = name;
    }
  }

  return clampAirlineLabelOverrides({ byAwbPrefix, byFlightPrefix });
}
