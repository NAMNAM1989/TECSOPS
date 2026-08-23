import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "./blankShipment";
import { computeDayPulseTotals, computeOpsDayOverview } from "./opsDayOverview";
import { computeWarehouseMetrics } from "./warehouseMetrics";

function lot(
  partial: Partial<Shipment> & { id: string; warehouse: Shipment["warehouse"] },
): Shipment {
  return {
    ...blankShipmentDraft(partial.sessionDate ?? "2026-08-21", partial.warehouse),
    stt: 1,
    ...partial,
  } as Shipment;
}

describe("computeDayPulseTotals", () => {
  it("cộng Lô · Kiện · Kg; null/NaN coi như 0", () => {
    const rows = [
      lot({ id: "a", warehouse: "TCS", pcs: 2, kg: 10.5 }),
      lot({ id: "b", warehouse: "SCSC", pcs: 3, kg: 4 }),
      lot({ id: "c", warehouse: "TECS-TCS", pcs: null, kg: null }),
      lot({ id: "d", warehouse: "TECS-SCSC", pcs: Number.NaN, kg: Number.NaN }),
    ];
    expect(computeDayPulseTotals(rows)).toEqual({ lots: 4, pcs: 5, kg: 14.5 });
  });

  it("rỗng → 0", () => {
    expect(computeDayPulseTotals([])).toEqual({ lots: 0, pcs: 0, kg: 0 });
  });
});

describe("computeOpsDayOverview", () => {
  it("Tổng ngày = tổng 4 kho; cùng nguồn computeWarehouseMetrics", () => {
    const rows = [
      lot({ id: "tcs", warehouse: "TCS", pcs: 2, kg: 8 }),
      lot({ id: "tcs-2", warehouse: "TCS", pcs: 1, kg: 2 }),
      lot({ id: "scsc", warehouse: "SCSC", pcs: 4, kg: 12 }),
      lot({ id: "tecs-tcs", warehouse: "TECS-TCS", pcs: 5, kg: 20 }),
    ];
    const overview = computeOpsDayOverview(rows);
    const byWh = computeWarehouseMetrics(rows);

    expect(overview.byWarehouse).toEqual(byWh);
    expect(overview.byWarehouse.TCS).toEqual({ lots: 2, pcs: 3, kg: 10 });
    expect(overview.byWarehouse.SCSC).toEqual({ lots: 1, pcs: 4, kg: 12 });
    expect(overview.byWarehouse["TECS-TCS"]).toEqual({ lots: 1, pcs: 5, kg: 20 });
    expect(overview.byWarehouse["TECS-SCSC"]).toEqual({ lots: 0, pcs: 0, kg: 0 });
    expect(overview.totals).toEqual({ lots: 4, pcs: 12, kg: 42 });
    expect(overview.totals).toEqual(computeDayPulseTotals(rows));
  });

  it("caller đã lọc ngày/status/text — helper không tự lọc lại", () => {
    const filtered = [
      lot({
        id: "keep",
        warehouse: "TCS",
        sessionDate: "2026-08-21",
        pcs: 2,
        kg: 5,
        status: "RECEIVED",
      }),
    ];
    expect(computeDayPulseTotals(filtered)).toEqual({ lots: 1, pcs: 2, kg: 5 });
  });
});
