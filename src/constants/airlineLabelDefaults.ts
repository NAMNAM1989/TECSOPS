/**
 * Thin typed wrapper — dữ liệu thật ở `shared/airlineLabelDefaults.mjs`.
 */
import {
  DEFAULT_AIRLINE_BY_AWB_PREFIX as AWB,
  DEFAULT_AIRLINE_BY_FLIGHT_PREFIX as FLIGHT,
} from "../../shared/airlineLabelDefaults.mjs";

export const DEFAULT_AIRLINE_BY_AWB_PREFIX: Record<string, string> = AWB;
export const DEFAULT_AIRLINE_BY_FLIGHT_PREFIX: Record<string, string> = FLIGHT;
