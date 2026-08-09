import {
  ECARGO_PLATE_MIN,
  type EcargoVehiclePick,
  validateEcargoVehiclePick,
} from "./buildEcargoVctFillPayload";
import { normalizeVehiclePlateInput } from "./vehiclePlateNormalize";

export const ECARGO_PLATE_REQUIRED_MSG =
  "Vui lòng nhập biển số xe trước khi đăng ký eCargo.";

/** Thiếu biển (không áp dụng Đi bộ). */
export function isEcargoPlateMissing(pick: EcargoVehiclePick | null | undefined): boolean {
  if (!pick) return true;
  if (pick.vehicleType === "DIBO") return false;
  const plates = normalizeVehiclePlateInput(pick.licensePlate)
    .split(";")
    .filter(Boolean);
  return plates.length === 0;
}

/** Lỗi biển số thân thiện UI — null nếu OK hoặc DIBO. */
export function getEcargoPlateFieldError(
  pick: EcargoVehiclePick | null | undefined
): string | null {
  if (!pick) return ECARGO_PLATE_REQUIRED_MSG;
  if (pick.vehicleType === "DIBO") return null;
  if (isEcargoPlateMissing(pick)) return ECARGO_PLATE_REQUIRED_MSG;
  const err = validateEcargoVehiclePick(pick);
  if (!err) return null;
  if (/biển|thiếu biển/i.test(err)) return err;
  return null;
}

/** Có thể bấm Đăng ký/Điền về phía xe (plate + TX). */
export function getEcargoVehicleGateError(
  pick: EcargoVehiclePick | null | undefined
): string | null {
  if (!pick) return "Chọn xe từ hồ sơ khách hoặc nhập xe lần này.";
  return validateEcargoVehiclePick(pick);
}

export function normalizeEcargoPlateForSubmit(raw: string): string {
  return normalizeVehiclePlateInput(raw);
}

/** Map lỗi Ext/API về field biển số. */
export function isVehicleNoMissingError(errorOrMessage: string | undefined | null): boolean {
  const t = String(errorOrMessage || "");
  if (!t) return false;
  if (/\bVEHICLE_NO_MISSING\b/i.test(t)) return true;
  if (/thiếu biển|biển số/i.test(t) && /thiếu|missing|bắt buộc|vui lòng/i.test(t)) {
    return true;
  }
  return false;
}

export { ECARGO_PLATE_MIN };
