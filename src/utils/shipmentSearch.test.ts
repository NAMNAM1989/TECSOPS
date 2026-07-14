import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentSearchHaystack,
  buildShipmentSearchMatches,
  shipmentMatchesSearchQuery,
} from "./shipmentSearch";

const baseRow = (patch: Partial<Shipment> = {}): Shipment => ({
  id: "s1",
  stt: 1,
  sessionDate: "2026-05-24",
  awb: "784-2004 2005",
  hawb: "HAWB-001",
  flight: "VN123",
  flightDate: "24MAY",
  customer: "ABC",
  customerCode: "ABC01",
  dest: "SIN",
  warehouse: "TECS-SCSC",
  status: "PENDING",
  pcs: 1,
  kg: 10,
  dimWeightKg: null,
  dimLines: null,
  dimDivisor: null,
  cutoff: "18:00",
  cutoffNote: "",
  note: "",
  ...patch,
});

describe("shipmentSearch", () => {
  const ctx = {
    customers: [
      {
        id: "c1",
        code: "ABC01",
        name: "ABC",
        savedVehicles: [
          {
            id: "v1",
            licensePlate: "50H17480",
            driverName: "Nguyen Van A",
            driverId: "123456789",
          },
        ],
      },
    ],
  };

  it("matches MAWB digits without dash", () => {
    const row = baseRow();
    expect(shipmentMatchesSearchQuery(row, "78420042005", ctx)).toBe(true);
    expect(shipmentMatchesSearchQuery(row, "784-2004", ctx)).toBe(true);
  });

  it("matches HAWB text", () => {
    expect(shipmentMatchesSearchQuery(baseRow(), "hawb-001", ctx)).toBe(true);
  });

  it("matches vehicle plate case-insensitively", () => {
    expect(shipmentMatchesSearchQuery(baseRow(), "50h17480", ctx)).toBe(true);
  });

  it("matches driver name from customer vehicles", () => {
    expect(shipmentMatchesSearchQuery(baseRow(), "nguyen van", ctx)).toBe(true);
  });

  it("builds haystack with vehicle and driver", () => {
    const hay = buildShipmentSearchHaystack(baseRow(), ctx);
    expect(hay).toContain("50h17480");
    expect(hay).toContain("nguyen van a");
  });

  it("returns match metadata with warehouse shipment", () => {
    const matches = buildShipmentSearchMatches([baseRow()], "50H17480", ctx);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.kind).toBe("vehicle");
    expect(matches[0]?.shipment.warehouse).toBe("TECS-SCSC");
  });
});
