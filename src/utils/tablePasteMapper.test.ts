import { describe, it, expect } from "vitest";
import { buildPastePlan } from "./tablePasteMapper";
import type { Shipment } from "../types";

function mockShipment(id: string, over: Partial<Shipment> = {}): Shipment {
  return {
    id,
    stt: 1,
    awb: "12345678",
    hawb: "H01",
    flight: "VN123",
    flightDate: "2026-10-06",
    dest: "SGN",
    pcs: 10,
    kg: 100,
    cbm: 1.5,
    customer: "CTY A",
    note: "Ghi chú",
    warehouse: "TCS",
    ...over,
  };
}

describe("tablePasteMapper", () => {
  it("maps TSV rectangular grid starting from activeCell", () => {
    const rows = [
      mockShipment("row-1", { hawb: "OLD1", flight: "OLD_F1" }),
      mockShipment("row-2", { hawb: "OLD2", flight: "OLD_F2" }),
    ];

    // Grid: 2 rows x 2 columns (hawb, flight)
    const grid = [
      ["NEW_H1", "NEW_F1"],
      ["NEW_H2", "NEW_F2"],
    ];

    const plan = buildPastePlan(grid, { rowId: "row-1", field: "hawb" }, rows);

    expect(plan.affectedRowsCount).toBe(2);
    expect(plan.droppedRowsCount).toBe(0);
    expect(plan.forwardMutations).toHaveLength(2);
    expect(plan.forwardMutations[0]).toEqual({
      id: "row-1",
      action: "UPDATE",
      patch: { hawb: "NEW_H1", flight: "NEW_F1" },
    });
    expect(plan.forwardMutations[1]).toEqual({
      id: "row-2",
      action: "UPDATE",
      patch: { hawb: "NEW_H2", flight: "NEW_F2" },
    });

    // Reverse mutations should hold old values for undo
    expect(plan.reverseMutations[0]).toEqual({
      id: "row-1",
      action: "UPDATE",
      patch: { hawb: "OLD1", flight: "OLD_F1" },
    });
    expect(plan.reverseMutations[1]).toEqual({
      id: "row-2",
      action: "UPDATE",
      patch: { hawb: "OLD2", flight: "OLD_F2" },
    });
  });

  it("truncates overflow rows when paste grid exceeds table row count (PASTE_CREATES_ROWS = false)", () => {
    const rows = [mockShipment("row-1")];
    const grid = [
      ["VAL1"],
      ["VAL2"],
      ["VAL3"],
    ];

    const plan = buildPastePlan(grid, { rowId: "row-1", field: "note" }, rows);
    expect(plan.affectedRowsCount).toBe(1);
    expect(plan.droppedRowsCount).toBe(2);
    expect(plan.forwardMutations).toHaveLength(1);
  });

  it("converts numeric fields (pcs, kg, dimKg) properly", () => {
    const rows = [mockShipment("row-1", { pcs: 5, kg: 20 })];
    // fields from pcs -> kg
    const grid = [["15", "45.5"]];

    const plan = buildPastePlan(grid, { rowId: "row-1", field: "pcs" }, rows);
    expect(plan.forwardMutations[0].patch).toEqual({
      pcs: 15,
      kg: 45.5,
    });
  });
});
