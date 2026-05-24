import { describe, expect, it } from "vitest";
import { emptyCustomerSavedShipper, emptyCustomerSavedVehicle } from "./customerDirectoryProfile";
import { scaffoldNewCustomer } from "./customerDirectoryScaffold";
import {
  isValidAgentCode,
  isValidLicensePlate,
  isValidNationalId,
  normalizeCustomerEntryForSave,
  validateCustomerEntrySection,
  validateCustomerDirectory,
} from "./customerDirectoryValidation";

describe("customerDirectoryValidation", () => {
  it("requires valid agent code", () => {
    expect(isValidAgentCode("ABC")).toBe(true);
    expect(isValidAgentCode("")).toBe(false);
    expect(isValidAgentCode("bad@")).toBe(false);
  });

  it("validates national id length", () => {
    expect(isValidNationalId("123456789")).toBe(true);
    expect(isValidNationalId("123456789012")).toBe(true);
    expect(isValidNationalId("12345")).toBe(false);
  });

  it("rejects empty shipper section", () => {
    const row = scaffoldNewCustomer("c1");
    row.code = "ABC";
    row.name = "TEST CO";
    const r = validateCustomerEntrySection(row, "shipper", [row]);
    expect(r.valid).toBe(false);
    expect(r.summary).toMatch(/người gửi/i);
  });

  it("accepts shipper with name", () => {
    const row = scaffoldNewCustomer("c1");
    row.code = "ABC";
    row.name = "TEST CO";
    row.savedShippers = [{ ...emptyCustomerSavedShipper(), shipperName: "ACME" }];
    const r = validateCustomerEntrySection(row, "shipper", [row]);
    expect(r.valid).toBe(true);
  });

  it("requires vehicle plate and paired driver fields", () => {
    const row = scaffoldNewCustomer("c1");
    row.code = "ABC";
    row.name = "TEST CO";
    row.savedShippers = [{ ...emptyCustomerSavedShipper(), shipperName: "ACME" }];
    row.savedVehicles = [
      {
        ...emptyCustomerSavedVehicle(),
        licensePlate: "50H17480",
        driverName: "Nguyen Van A",
      },
    ];
    const r = validateCustomerEntrySection(row, "vehicle", [row]);
    expect(r.valid).toBe(false);
  });

  it("accepts complete vehicle row", () => {
    const row = scaffoldNewCustomer("c1");
    row.code = "ABC";
    row.name = "TEST CO";
    row.savedShippers = [{ ...emptyCustomerSavedShipper(), shipperName: "ACME" }];
    row.savedVehicles = [
      {
        ...emptyCustomerSavedVehicle(),
        licensePlate: "50H17480",
        driverName: "Nguyen Van A",
        driverId: "123456789012",
      },
    ];
    expect(isValidLicensePlate("50H17480")).toBe(true);
    const r = validateCustomerEntrySection(row, "vehicle", [row]);
    expect(r.valid).toBe(true);
  });

  it("strips empty rows on normalize", () => {
    const row = scaffoldNewCustomer("c1");
    row.code = "ABC";
    row.name = "TEST CO";
    row.savedShippers = [
      { ...emptyCustomerSavedShipper(), shipperName: "ACME" },
      emptyCustomerSavedShipper(),
    ];
    const normalized = normalizeCustomerEntryForSave(row);
    expect(normalized.savedShippers).toHaveLength(1);
  });

  it("detects duplicate customer codes", () => {
    const a = scaffoldNewCustomer("c1");
    a.code = "DUP";
    a.name = "A";
    a.savedShippers = [{ ...emptyCustomerSavedShipper(), shipperName: "X" }];
    const b = scaffoldNewCustomer("c2");
    b.code = "dup";
    b.name = "B";
    b.savedShippers = [{ ...emptyCustomerSavedShipper(), shipperName: "Y" }];
    const r = validateCustomerDirectory([a, b]);
    expect(r.valid).toBe(false);
  });
});
