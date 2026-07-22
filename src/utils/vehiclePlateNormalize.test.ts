import { describe, expect, it } from "vitest";
import { normalizeVehiclePlateInput, VEHICLE_PLATE_MIN } from "./vehiclePlateNormalize";

describe("normalizeVehiclePlateInput", () => {
  it("uppercase và bỏ ký tự lạ, giữ ;", () => {
    expect(normalizeVehiclePlateInput("50h-174 80")).toBe("50H17480");
    expect(normalizeVehiclePlateInput("50H17480;51G99999")).toBe("50H17480;51G99999");
  });

  it("VEHICLE_PLATE_MIN", () => {
    expect(VEHICLE_PLATE_MIN).toBe(4);
  });
});
