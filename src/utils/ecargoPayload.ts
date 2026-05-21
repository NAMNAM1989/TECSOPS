import type { EcargoRegisterFromOpsMessage, EcargoRegisterBuildInput } from "../types/ecargo";
import type { Shipment } from "../types/shipment";
import { isScscWarehouse } from "../constants/warehouses";
import { parseBookingDateLoose } from "./bookingDateParse";

const DEFAULT_PCS = 99;
const DEFAULT_GW = 1000;
const DEFAULT_COMMODITY = "Garment";
const DEFAULT_SHC = "0";

/** MAWB chuẩn 11 số → `xxx-xxxxxxxx`. */
const MAWB_NORMALIZED = /^\d{3}-\d{8}$/;

/**
 * Chỉ giữ chữ/số và `;`, viết hoa, bỏ khoảng trắng và ký tự đặc biệt khác.
 */
export function normalizeVehicleNo(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => /[A-Z0-9;]/.test(c))
    .join("");
}

/**
 * Chuẩn hóa MAWB: bỏ khoảng trắng; nếu đúng 11 chữ số thì `xxx-xxxxxxxx`;
 * giữ chữ số và dấu `-` cho các trường hợp còn lại.
 */
export function normalizeMawb(raw: string): string {
  const collapsed = raw.replace(/\s/g, "").toUpperCase();
  const digitsOnly = collapsed.replace(/\D/g, "");
  if (digitsOnly.length === 11) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3)}`;
  }
  return collapsed.replace(/[^0-9A-Z-]/g, "");
}

/**
 * Đích: viết hoa, bỏ ký tự đặc biệt (chỉ giữ A–Z, 0–9).
 */
export function normalizeDestination(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Ngày bay (ô lưới: `11MAY`, ISO, v.v.) → `YYYY-MM-DD` theo `parseBookingDateLoose`.
 */
export function parseFlightDateToIso(flightDateRaw: string, viewYear: number): string {
  return parseBookingDateLoose(flightDateRaw.trim(), viewYear);
}

export function isNormalizedVehicleNoValid(v: string): boolean {
  return normalizeVehicleNo(v).length >= 7;
}

export function isMawbCompleteForEcargo(awbRaw: string): boolean {
  return MAWB_NORMALIZED.test(normalizeMawb(awbRaw));
}

/** Ngày hiện tại theo giờ VN — `YYYY-MM-DD`. */
export function todayIsoVietnam(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function canSendEcargoRegister(row: Shipment, vehicleNormalized: string, viewSessionYmd: string): boolean {
  return getEcargoRegisterReadiness(row, vehicleNormalized, viewSessionYmd).ready;
}

/**
 * Cho biết đã đủ dữ liệu để gửi eCargo hay chưa (trước / khi bấm Đăng ký).
 * `hint` là một dòng ngắn để hiển thị trong UI.
 */
export function getEcargoRegisterReadiness(
  row: Shipment,
  vehicleRaw: string,
  viewSessionYmd: string
): { ready: boolean; hint: string } {
  if (!isScscWarehouse(row.warehouse)) {
    return { ready: false, hint: "Chỉ dùng cho kho SCSC (TECS-SCSC hoặc KHO SCSC)." };
  }

  const missing: string[] = [];
  const v = normalizeVehicleNo(vehicleRaw);
  if (v.length === 0) missing.push("số xe");
  else if (v.length < 7) missing.push(`số xe (còn ${7 - v.length} ký tự)`);
  if (!isMawbCompleteForEcargo(row.awb)) missing.push("MAWB 11 số");
  if (!row.flight?.trim()) missing.push("chuyến bay");
  const y = parseInt(viewSessionYmd.slice(0, 4), 10);
  const year = Number.isFinite(y) && y >= 1900 ? y : new Date().getFullYear();
  const flightDateIso = parseFlightDateToIso(row.flightDate, year);
  if (!flightDateIso) missing.push("ngày bay");
  else if (flightDateIso < todayIsoVietnam()) {
    return {
      ready: false,
      hint: "Ngày bay đã qua — eCargo không chấp nhận. Cập nhật ngày bay trên lô.",
    };
  }
  if (normalizeDestination(row.dest).length < 2) missing.push("DEST");

  if (missing.length === 0) {
    return { ready: true, hint: "Đã nhập đủ — có thể bấm Đăng ký." };
  }
  return { ready: false, hint: `Chưa đủ: ${missing.join(" · ")}` };
}

export function buildEcargoPayload(input: EcargoRegisterBuildInput): EcargoRegisterFromOpsMessage {
  const { row, vehicleNormalized, viewSessionYmd } = input;
  const y = parseInt(viewSessionYmd.slice(0, 4), 10);
  const year = Number.isFinite(y) && y >= 1900 ? y : new Date().getFullYear();
  const flightDateIso = parseFlightDateToIso(row.flightDate, year);
  const mawb = normalizeMawb(row.awb);
  const hawbRaw = row.hawb?.trim() ?? "";
  const hawb = hawbRaw.length > 0 ? hawbRaw : "0";
  const pcs = row.pcs != null && row.pcs > 0 ? row.pcs : DEFAULT_PCS;
  const grossWeight = row.kg != null && row.kg > 0 ? row.kg : DEFAULT_GW;
  const customerName = row.customer?.trim() ?? "";

  return {
    type: "ECARGO_REGISTER_FROM_OPS",
    payload: {
      vehicleNo: normalizeVehicleNo(vehicleNormalized),
      mawb,
      hawb,
      flight: row.flight.trim().toUpperCase(),
      flightDate: flightDateIso,
      destination: normalizeDestination(row.dest),
      pcs,
      grossWeight,
      commodity: DEFAULT_COMMODITY,
      shc: DEFAULT_SHC,
      source: "ops",
      warehouse: "SCSC",
      opsShipmentId: row.id,
      customerName,
    },
  };
}
