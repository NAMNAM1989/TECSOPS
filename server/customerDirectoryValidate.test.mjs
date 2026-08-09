import { describe, expect, it } from "vitest";
import {
  parseCustomersLoose,
  validateCustomerDirectoryPayload,
} from "./customerDirectoryValidate.mjs";

describe("customerDirectoryValidate — giữ vehicleType + DIM templates", () => {
  const base = {
    id: "c1",
    code: "ABC",
    name: "ABC Co",
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [
      {
        id: "v1",
        label: "Xe 1",
        licensePlate: "51A12345",
        driverName: "An",
        driverId: "001122334455",
        driverIdType: "CCCD",
        vehicleType: "OTO",
      },
    ],
    savedDimTemplates: [
      {
        id: "d1",
        label: "40x30x25",
        lCm: 40,
        wCm: 30,
        hCm: 25,
        stdPcsKg: 12.5,
        isDefault: true,
      },
    ],
    defaultVehicleId: "v1",
    defaultDimTemplateId: "d1",
    parties: [],
  };

  it("parseCustomersLoose giữ vehicleType / label / dim templates", () => {
    const [c] = parseCustomersLoose([base]);
    expect(c.savedVehicles[0]).toMatchObject({
      id: "v1",
      label: "Xe 1",
      vehicleType: "OTO",
      driverIdType: "CCCD",
    });
    expect(c.savedDimTemplates[0]).toMatchObject({
      id: "d1",
      lCm: 40,
      wCm: 30,
      hCm: 25,
      stdPcsKg: 12.5,
    });
    expect(c.defaultDimTemplateId).toBe("d1");
  });

  it("validateCustomerDirectoryPayload không strip vehicleType", () => {
    const [c] = validateCustomerDirectoryPayload([base]);
    expect(c.savedVehicles[0].vehicleType).toBe("OTO");
    expect(c.savedDimTemplates).toHaveLength(1);
    expect(c.defaultDimTemplateId).toBe("d1");
  });
});
