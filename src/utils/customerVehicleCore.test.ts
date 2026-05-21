import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildVehicleEcargoInput,
  filterCustomerVehicles,
  getDefaultCustomerVehicle,
  isCustomerVehicleDefault,
  resolveEcargoVehiclePrefill,
  upsertCustomerVehicleInDirectory,
} from "./customerVehicleCore";

const baseCustomer = (): CustomerDirectoryEntry => ({
  id: "c1",
  code: "CYL",
  name: "CYL Agent",
  parties: [],
  savedVehicles: [
    { id: "v1", licensePlate: "50H17480", driverName: "Nguyen A", driverId: "086204007404" },
    { id: "v2", licensePlate: "51G99999", driverName: "Tran B", driverId: "123456789012" },
  ],
  defaultVehicleId: "v1",
});

describe("getDefaultCustomerVehicle", () => {
  it("returns default by defaultVehicleId", () => {
    const v = getDefaultCustomerVehicle(baseCustomer());
    expect(v?.licensePlate).toBe("50H17480");
  });

  it("returns sole vehicle when only one", () => {
    const c = { ...baseCustomer(), savedVehicles: [baseCustomer().savedVehicles![0]!], defaultVehicleId: undefined };
    expect(getDefaultCustomerVehicle(c)?.id).toBe("v1");
  });
});

describe("isCustomerVehicleDefault", () => {
  it("marks default vehicle", () => {
    const c = baseCustomer();
    expect(isCustomerVehicleDefault(c, c.savedVehicles![0]!)).toBe(true);
    expect(isCustomerVehicleDefault(c, c.savedVehicles![1]!)).toBe(false);
  });
});

describe("resolveEcargoVehiclePrefill", () => {
  it("prefills default when no saved input", () => {
    const row = { id: "s1", customerCode: "CYL", customer: "CYL Agent", customerId: "c1" } as const;
    const r = resolveEcargoVehiclePrefill(row as never, [baseCustomer()], "");
    expect(r.vehicleInput).toBe("50H17480");
    expect(r.driverName).toBe("Nguyen A");
  });

  it("keeps saved shipment vehicle over default", () => {
    const row = { id: "s1", customerCode: "CYL", customer: "CYL Agent", customerId: "c1" } as const;
    const r = resolveEcargoVehiclePrefill(row as never, [baseCustomer()], "51G99999");
    expect(r.vehicleInput).toBe("51G99999");
    expect(r.driverName).toBe("Tran B");
  });
});

describe("upsertCustomerVehicleInDirectory", () => {
  it("updates existing plate and sets default", () => {
    const next = upsertCustomerVehicleInDirectory([baseCustomer()], {
      customerId: "c1",
      licensePlate: "50h-174 80",
      driverName: "Updated Name",
      driverId: "999",
      setAsDefault: true,
    });
    const v = next[0]!.savedVehicles!.find((x) => x.licensePlate === "50H17480");
    expect(v?.driverName).toBe("Updated Name");
    expect(next[0]!.defaultVehicleId).toBe(v?.id);
  });

  it("adds new vehicle", () => {
    const next = upsertCustomerVehicleInDirectory([baseCustomer()], {
      customerId: "c1",
      licensePlate: "99Z88888",
      driverName: "New Driver",
      driverId: "111",
      setAsDefault: false,
    });
    expect(next[0]!.savedVehicles).toHaveLength(3);
  });
});

describe("filterCustomerVehicles", () => {
  it("filters by plate or driver", () => {
    const list = baseCustomer().savedVehicles!;
    expect(filterCustomerVehicles(list, "tran").map((v) => v.id)).toEqual(["v2"]);
    expect(filterCustomerVehicles(list, "50H").map((v) => v.id)).toEqual(["v1"]);
  });
});

describe("buildVehicleEcargoInput", () => {
  it("normalizes plate", () => {
    expect(buildVehicleEcargoInput({ licensePlate: "50h-174 80" })).toBe("50H17480");
  });
});
