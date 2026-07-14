/**
 * Tính / làm tròn DIM (chargeable weight) theo quy tắc SCSC Required airline.
 */
import {
  SCSC_KNOWN_FLIGHT_CODES,
  SCSC_RULE_BY_AWB_PREFIX,
  SCSC_RULE_BY_FLIGHT_CODE,
  type ScscAirlineDimRule,
  type ScscChargeableRoundKind,
} from "../constants/scscAirlineChargeableRules";
import { extractFlightAirlinePrefix } from "./mapShipmentToAirCargoLabelData";
import { rawAwbDigits } from "./awbFormat";

export type { ScscChargeableRoundKind, ScscAirlineDimRule };

function roundToDecimals(n: number, dp: number): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Làm tròn bậc `step` (0.5 / 1), khử nhiễu float. */
export function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(n) || step <= 0) return n;
  const rounded = Math.round(n / step) * step;
  return roundToDecimals(rounded, 3);
}

/**
 * QR — 1 số lẻ: digit thập phân 0 giữ; 1–4 → +0.5; ≥5 → lên số nguyên tiếp.
 * (Áp trên phần thập phân của |kg|.)
 */
export function applyQrOneDecimalRule(kg: number): number {
  if (!Number.isFinite(kg)) return kg;
  const sign = kg < 0 ? -1 : 1;
  const x = Math.abs(kg);
  const whole = Math.floor(x + 1e-12);
  const frac = x - whole;
  const digit = Math.floor(frac * 10 + 1e-9);
  if (digit === 0) return sign * whole;
  if (digit >= 1 && digit <= 4) return sign * (whole + 0.5);
  return sign * (whole + 1);
}

/** Áp quy tắc chargeable lên 1 giá trị kg thô (đã × kiện). */
export function applyScscChargeableRounding(rawKg: number, kind: ScscChargeableRoundKind): number {
  if (!Number.isFinite(rawKg) || rawKg <= 0) return rawKg;
  switch (kind) {
    case "DP3_ROUND_0_5":
      return roundToStep(roundToDecimals(rawKg, 3), 0.5);
    case "DP3_ROUND_1":
      return roundToStep(roundToDecimals(rawKg, 3), 1);
    case "DP2_ROUND_0_5":
      return roundToStep(roundToDecimals(rawKg, 2), 0.5);
    case "ROUND_INTEGER":
      return Math.round(rawKg);
    case "QR_SPECIAL":
      return applyQrOneDecimalRule(rawKg);
    case "STANDARD_IATA_2DP":
    default:
      return roundToDecimals(rawKg, 2);
  }
}

/** Tổng sau khi cộng các dòng — QR cần làm tròn bậc 0.5 thêm lần nữa. */
export function applyScscTotalRounding(sumKg: number, kind: ScscChargeableRoundKind): number {
  if (!Number.isFinite(sumKg)) return sumKg;
  if (kind === "QR_SPECIAL") return roundToStep(sumKg, 0.5);
  if (kind === "DP3_ROUND_0_5" || kind === "DP2_ROUND_0_5") {
    return roundToStep(sumKg, 0.5);
  }
  if (kind === "DP3_ROUND_1" || kind === "ROUND_INTEGER") {
    return Math.round(sumKg);
  }
  return roundToDecimals(sumKg, 2);
}

export function formatScscChargeableKg(kg: number, kind: ScscChargeableRoundKind): string {
  if (!Number.isFinite(kg)) return "—";
  switch (kind) {
    case "DP3_ROUND_0_5":
    case "DP2_ROUND_0_5":
    case "QR_SPECIAL":
      return (Math.round(kg * 10) / 10).toFixed(1);
    case "DP3_ROUND_1":
    case "ROUND_INTEGER":
      return String(Math.round(kg));
    case "STANDARD_IATA_2DP":
    default:
      return String(roundToDecimals(kg, 2));
  }
}

/**
 * Ưu tiên mã chuyến; fallback 3 số AWB.
 * SQ/TR cùng prefix 618 — bắt buộc có chuyến để phân biệt.
 */
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
  return resolveScscAirlineDimRule(flight, awb)?.round ?? "STANDARD_IATA_2DP";
}
