import { describe, expect, it } from "vitest";
import { blankShipmentDraft } from "./blankShipment";
import { summarizeWarehouseHeader } from "./warehouseHeaderTotals";

describe("summarizeWarehouseHeader", () => {
  it("cộng kiện, kg, DIM và chargeable của các lô trong kho", () => {
    const plain = {
      ...blankShipmentDraft("2026-10-03", "TECS-SCSC"),
      id: "a",
      pcs: 4,
      kg: 10,
      dimWeightKg: null,
    };
    const withDim = {
      ...blankShipmentDraft("2026-10-03", "TECS-SCSC"),
      id: "b",
      pcs: 2,
      kg: 8,
      dimWeightKg: 12,
    };
    const totals = summarizeWarehouseHeader([plain, withDim]);
    expect(totals.lots).toBe(2);
    expect(totals.pcs).toBe(6);
    expect(totals.actualKg).toBe(18);
    expect(totals.dimKg).toBe(12);
    expect(totals.chargeableKg).toBe(22);
  });
});
