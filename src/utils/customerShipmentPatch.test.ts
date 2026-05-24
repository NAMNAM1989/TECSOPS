import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildShipmentPatchForCustomerSelection,
  filterCustomerDirectoryEntries,
} from "./customerShipmentPatch";

const directory: CustomerDirectoryEntry[] = [
  {
    id: "c1",
    code: "ABC01",
    name: "ABC Logistics",
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [],
    parties: [],
  },
  {
    id: "c2",
    code: "SCSC",
    name: "SCSC Express",
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [],
    parties: [],
  },
];

describe("filterCustomerDirectoryEntries", () => {
  it("filters by code or name", () => {
    expect(filterCustomerDirectoryEntries(directory, "abc").map((e) => e.id)).toEqual(["c1"]);
    expect(filterCustomerDirectoryEntries(directory, "scsc").map((e) => e.id)).toEqual(["c2"]);
  });

  it("puts preferred customer first when query empty", () => {
    expect(filterCustomerDirectoryEntries(directory, "", 12, "c2").map((e) => e.id)).toEqual([
      "c2",
      "c1",
    ]);
  });
});

describe("buildShipmentPatchForCustomerSelection", () => {
  it("fills code and id when entry selected", () => {
    const patch = buildShipmentPatchForCustomerSelection(directory, "ABC Logistics", directory[0]);
    expect(patch.customerCode).toBe("ABC01");
    expect(patch.customerId).toBe("c1");
  });
});
