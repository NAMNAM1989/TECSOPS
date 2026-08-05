/**
 * Chuẩn hóa text eCargo: bỏ dấu, uppercase.
 * Họ tên: giữ khoảng trắng giữa từ (VD: NGUYEN VAN A) — khớp placeholder eCargo.
 */

import type { Shipment } from "../types/shipment";
import { flightDateToYmd } from "./esidDeclareFields";

export function stripVietnameseDiacritics(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Họ tên eCargo: bỏ dấu / ký tự đặc biệt, GIỮ khoảng trắng giữa từ.
 * «Viết liền» trên eCargo = không dấu/ký tự lạ — không phải dính hết thành 1 khối.
 */
export function normalizeEcargoPersonName(raw: string): string {
  return stripVietnameseDiacritics(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEcargoIdNumber(raw: string): string {
  return stripVietnameseDiacritics(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Hôm nay local YYYY-MM-DD. */
export function todayLocalYmd(from = new Date()): string {
  const y = from.getFullYear();
  const m = String(from.getMonth() + 1).padStart(2, "0");
  const day = String(from.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ngày mai local YYYY-MM-DD. */
export function tomorrowLocalYmd(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return todayLocalYmd(d);
}

/**
 * Chuẩn hóa ngày hàng vào: chỉ kiểm tra format YYYY-MM-DD.
 * Trống/sai → fallback (mặc định hôm nay). Không ép «sau hôm nay».
 */
export function ensureEcargoArrivalDate(
  raw?: string | null,
  from = new Date(),
  fallbackYmd?: string
): string {
  const ymd = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return fallbackYmd && /^\d{4}-\d{2}-\d{2}$/.test(fallbackYmd)
    ? fallbackYmd
    : todayLocalYmd(from);
}

/**
 * Tách số hiệu CB Ops (VD VJ842) → carrier + số chuyến cho form eCargo.
 * Ô #txtFlightNo tối đa 4 ký tự (chỉ phần số), carrier ở #txtCarrier.
 */
export function splitEcargoFlightDesignator(raw: string): {
  carrier: string;
  flightNo: string;
} {
  const compact = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return { carrier: "", flightNo: "" };
  const m = compact.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})$/);
  if (m) return { carrier: m[1]!, flightNo: m[2]! };
  return {
    carrier: compact.slice(0, 2),
    flightNo: compact.slice(2, 6),
  };
}

export type EcargoArrivalFromShipments = {
  arrivalDate: string;
  /** Các ngày bay khác nhau trong selection. */
  warning?: string;
};

/**
 * Mặc định ngày hàng vào = ngày bay sớm nhất trong các lô.
 * Không parse được → hôm nay. Cho phép cùng ngày bay.
 */
export function resolveEcargoArrivalDateFromShipments(
  shipments: Pick<Shipment, "flightDate" | "sessionDate" | "awb">[],
  from = new Date()
): EcargoArrivalFromShipments {
  const dates = new Set<string>();
  for (const s of shipments) {
    const ymd = flightDateToYmd(s.flightDate || "", s.sessionDate || "");
    if (ymd) dates.add(ymd);
  }
  const sorted = [...dates].sort();
  if (!sorted.length) {
    return { arrivalDate: todayLocalYmd(from) };
  }
  const arrivalDate = sorted[0]!;
  if (sorted.length > 1) {
    return {
      arrivalDate,
      warning: `Lô khác ngày bay (${sorted.join(", ")}) → dùng ngày sớm nhất ${arrivalDate}`,
    };
  }
  return { arrivalDate };
}
