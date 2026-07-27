import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  buildShipmentSearchHaystack,
  buildShipmentSearchMatches,
  listFlightDateFacets,
  normalizeFlightDateToken,
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

  it("normalizes flight date tokens", () => {
    expect(normalizeFlightDateToken("28jul")).toBe("28JUL");
    expect(normalizeFlightDateToken("28 JUL")).toBe("28JUL");
    expect(normalizeFlightDateToken("28/07")).toBe("28JUL");
    expect(normalizeFlightDateToken("8JUL")).toBe("08JUL");
  });

  it("filters by flight date when query is DDMMM", () => {
    const a = baseRow({ id: "a", flightDate: "28JUL" });
    const b = baseRow({ id: "b", flightDate: "24MAY", awb: "784-1111 2222" });
    expect(shipmentMatchesSearchQuery(a, "28jul", ctx)).toBe(true);
    expect(shipmentMatchesSearchQuery(b, "28JUL", ctx)).toBe(false);
    expect(shipmentMatchesSearchQuery(a, "28/07", ctx)).toBe(true);
  });

  it("lists flight date facets with counts", () => {
    const facets = listFlightDateFacets([
      baseRow({ id: "1", flightDate: "28JUL" }),
      baseRow({ id: "2", flightDate: "28jul", awb: "784-1" }),
      baseRow({ id: "3", flightDate: "24MAY", awb: "784-2" }),
    ]);
    expect(facets).toEqual([
      { date: "24MAY", count: 1 },
      { date: "28JUL", count: 2 },
    ]);
  });

  it("marks flightDate match kind", () => {
    const matches = buildShipmentSearchMatches([baseRow({ flightDate: "28JUL" })], "28JUL", ctx);
    expect(matches[0]?.kind).toBe("flightDate");
  });
});
