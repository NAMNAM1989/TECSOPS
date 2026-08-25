import { describe, expect, it } from "vitest";
import {
  ECARGO_PLATE_REQUIRED_MSG,
  getEcargoPlateFieldError,
  getEcargoVehicleGateError,
  isEcargoPlateMissing,
  isVehicleNoMissingError,
  normalizeEcargoPlateForSubmit,
} from "./ecargoVehicleValidation";

describe("ecargoVehicleValidation", () => {
  it("thiếu biển → message chuẩn + disable gate", () => {
    const pick = {
      source: "oneshot" as const,
      licensePlate: "",
      driverName: "A",
      driverId: "1",
      driverIdType: "CCCD" as const,
      vehicleType: "OTO" as const,
    };
    expect(isEcargoPlateMissing(pick)).toBe(true);
    expect(getEcargoPlateFieldError(pick)).toBe(ECARGO_PLATE_REQUIRED_MSG);
    expect(getEcargoVehicleGateError(pick)).toBe(ECARGO_PLATE_REQUIRED_MSG);
  });

  it("biển hợp lệ → không lỗi plate", () => {
    const pick = {
      source: "oneshot" as const,
      licensePlate: "50H17480",
      driverName: "NGUYEN VAN A",
      driverId: "001122334455",
      driverIdType: "CCCD" as const,
      vehicleType: "OTO" as const,
    };
    expect(isEcargoPlateMissing(pick)).toBe(false);
    expect(getEcargoPlateFieldError(pick)).toBeNull();
    expect(getEcargoVehicleGateError(pick)).toBeNull();
  });

  it("DIBO không bắt buộc biển", () => {
    const pick = {
      source: "oneshot" as const,
      licensePlate: "",
      driverName: "A",
      driverId: "1",
      driverIdType: "CCCD" as const,
      vehicleType: "DIBO" as const,
    };
    expect(isEcargoPlateMissing(pick)).toBe(false);
    expect(getEcargoPlateFieldError(pick)).toBeNull();
  });

  it("chuẩn hóa biển: trim + upper", () => {
    expect(normalizeEcargoPlateForSubmit(" 50h17480 ")).toBe("50H17480");
  });

  it("map lỗi Ext VEHICLE_NO_MISSING", () => {
    expect(isVehicleNoMissingError("VEHICLE_NO_MISSING")).toBe(true);
    expect(isVehicleNoMissingError("Thiếu biển số trên form")).toBe(true);
    expect(isVehicleNoMissingError("OTP timeout")).toBe(false);
  });
});
