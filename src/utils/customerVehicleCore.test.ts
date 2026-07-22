import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { findCustomerByShipment, formatVehicleLicensePlate } from "./customerVehicleCore";

const baseCustomer = (): CustomerDirectoryEntry => ({
  id: "c1",
  code: "CYL",
  name: "CYL Agent",
  parties: [],
  savedVehicles: [
    { id: "v1", licensePlate: "50H17480", driverName: "Nguyen A", driverId: "086204007404" },
  ],
  defaultVehicleId: "v1",
});

describe("formatVehicleLicensePlate", () => {
  it("uppercase và bỏ ký tự lạ", () => {
    expect(formatVehicleLicensePlate("50h-174 80")).toBe("50H17480");
  });
});

describe("findCustomerByShipment", () => {
  it("khớp theo customerId", () => {
    const row = { id: "s1", customerId: "c1", customerCode: "", customer: "" } as const;
    expect(findCustomerByShipment(row as never, [baseCustomer()])?.code).toBe("CYL");
  });

  it("khớp theo customerCode khi thiếu id", () => {
    const row = { id: "s1", customerId: "", customerCode: "CYL", customer: "" } as const;
    expect(findCustomerByShipment(row as never, [baseCustomer()])?.id).toBe("c1");
  });
});
