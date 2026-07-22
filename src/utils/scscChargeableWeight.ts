/**
 * Tính / làm tròn DIM (chargeable weight) theo quy tắc SCSC Required airline.
 */
import {
  legacyPolicyFromScscRule,
  SCSC_KNOWN_FLIGHT_CODES,
  SCSC_RULE_BY_AWB_PREFIX,
  SCSC_RULE_BY_FLIGHT_CODE,
  type ScscAirlineDimRule,
  type ScscChargeableRoundKind,
  type ScscLineDimRoundKind,
  type ScscTotalDimRoundKind,
} from "../constants/scscAirlineChargeableRules";
import { extractFlightAirlinePrefix } from "./mapShipmentToAirCargoLabelData";
import { rawAwbDigits } from "./awbFormat";

export type {
  ScscChargeableRoundKind,
  ScscAirlineDimRule,
  ScscLineDimRoundKind,
  ScscTotalDimRoundKind,
};

function roundToDecimals(n: number, dp: number): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function truncatePositiveKg(n: number, decimalPlaces: number): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  const f = 10 ** decimalPlaces;
  return Math.floor(n * f + 1e-9) / f;
}

/** Làm tròn lên bậc step — ví dụ tổng 100,104 → 100,5 (file SCSC). */
export function ceilToStep(n: number, step: number): number {
  if (!Number.isFinite(n) || step <= 0) return n;
  return roundToDecimals(Math.ceil(n / step - 1e-12) * step, 3);
}

/** DIM kg một dòng sau (D×R×C÷6000)×kiện — cột «Dim CỦA MỖI DÒNG». */
export function applyScscLineDimRounding(
  rawKg: number,
  kind: ScscLineDimRoundKind
): number {
  if (!Number.isFinite(rawKg) || rawKg <= 0) return rawKg;
  switch (kind) {
    case "TRUNCATE_3DP":
      return truncatePositiveKg(rawKg, 3);
    case "TRUNCATE_2DP":
      return truncatePositiveKg(rawKg, 2);
    case "ROUND_INTEGER":
      return Math.round(rawKg);
    case "QR_LINE":
      return truncatePositiveKg(rawKg, 1);
    default:
      return truncatePositiveKg(rawKg, 3);
  }
}

/** Tổng DIM sau cộng các dòng — cột «TỔNG Dim». */
export function applyScscTotalDimRounding(
  sumKg: number,
  kind: ScscTotalDimRoundKind
): number {
  if (!Number.isFinite(sumKg) || sumKg <= 0) return sumKg;
  switch (kind) {
    case "ROUND_0_5":
      return ceilToStep(truncatePositiveKg(sumKg, 3), 0.5);
    case "ROUND_1":
      return Math.round(truncatePositiveKg(sumKg, 3));
    case "ROUND_INTEGER":
      return Math.round(sumKg);
    case "QR_TOTAL":
      return ceilToStep(truncatePositiveKg(sumKg, 3), 0.5);
    default:
      return ceilToStep(truncatePositiveKg(sumKg, 3), 0.5);
  }
}



export function formatScscLineDimKg(kg: number, kind: ScscLineDimRoundKind): string {
  if (!Number.isFinite(kg)) return "—";
  switch (kind) {
    case "TRUNCATE_3DP":
      return truncatePositiveKg(kg, 3).toFixed(3);
    case "TRUNCATE_2DP":
      return truncatePositiveKg(kg, 2).toFixed(2);
    case "ROUND_INTEGER":
      return String(Math.round(kg));
    case "QR_LINE":
      return truncatePositiveKg(kg, 1).toFixed(1);
    default:
      return truncatePositiveKg(kg, 3).toFixed(3);
  }
}

export function formatScscTotalDimKg(kg: number, kind: ScscTotalDimRoundKind): string {
  if (!Number.isFinite(kg)) return "—";
  switch (kind) {
    case "ROUND_0_5":
    case "QR_TOTAL":
      return (Math.round(kg * 10) / 10).toFixed(1);
    case "ROUND_1":
    case "ROUND_INTEGER":
      return String(Math.round(kg));
    default:
      return (Math.round(kg * 10) / 10).toFixed(1);
  }
}


export function resolveScscAirlineDimRule(
  flight: string,
  awb = ""
): ScscAirlineDimRule | null {
  const code = extractFlightAirlinePrefix(flight, SCSC_KNOWN_FLIGHT_CODES);
  if (code) {
    const byFlight = SCSC_RULE_BY_FLIGHT_CODE.get(code);
    if (byFlight) return byFlight;
  }
  const awbPrefix = rawAwbDigits(awb).slice(0, 3);
  if (awbPrefix.length === 3) {
    return SCSC_RULE_BY_AWB_PREFIX.get(awbPrefix) ?? null;
  }
  return null;
}

export function scscChargeableKindFromShipment(
  flight: string,
  awb = ""
): ScscChargeableRoundKind {
  const rule = resolveScscAirlineDimRule(flight, awb);
  if (rule) return legacyPolicyFromScscRule(rule);
  return "STANDARD_IATA_2DP";
}

