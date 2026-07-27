import { describe, expect, it } from "vitest";
import { blankShipmentDraft } from "./blankShipment";
import {
  computeOpsStats,
  computeShipmentWeightMetrics,
} from "./opsStatsMetrics";
import {
  currentMonthYm,
  formatStatsPeriodLabel,
  monthYmToRange,
  resolveStatsPeriodRange,
  yearToRange,
} from "./opsStatsPeriod";
import type { Shipment } from "../types/shipment";

function sample(partial: Partial<Shipment> & { sessionDate: string }): Shipment {
  const base = blankShipmentDraft(partial.sessionDate, partial.warehouse ?? "TECS-TCS");
  return {
    id: partial.id ?? `id-${partial.sessionDate}-${Math.random()}`,
    stt: partial.stt ?? 1,
    ...base,
    ...partial,
  };
}

describe("opsStatsPeriod", () => {
  it("today / day → một ngày", () => {
    expect(resolveStatsPeriodRange({ mode: "today", todayYmd: "2026-07-27" })).toEqual({
      fromYmd: "2026-07-27",
      toYmd: "2026-07-27",
    });
    expect(
      resolveStatsPeriodRange({ mode: "day", dayYmd: "2026-07-01", todayYmd: "2026-07-27" })
    ).toEqual({ fromYmd: "2026-07-01", toYmd: "2026-07-01" });
  });

  it("month / year range", () => {
    expect(monthYmToRange("2026-02")).toEqual({
      fromYmd: "2026-02-01",
      toYmd: "2026-02-28",
    });
    expect(yearToRange(2026)).toEqual({
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
    });
    expect(
      resolveStatsPeriodRange({ mode: "month", monthYm: "2026-07", todayYmd: "2026-07-27" })
    ).toEqual({ fromYmd: "2026-07-01", toYmd: "2026-07-31" });
  });

  it("range đảo from/to", () => {
    expect(
      resolveStatsPeriodRange({
        mode: "range",
        rangeFromYmd: "2026-07-20",
        rangeToYmd: "2026-07-10",
      })
    ).toEqual({ fromYmd: "2026-07-10", toYmd: "2026-07-20" });
  });

  it("format label", () => {
    expect(
      formatStatsPeriodLabel({ fromYmd: "2026-07-27", toYmd: "2026-07-27" }, "today")
    ).toContain("Hôm nay");
    expect(currentMonthYm(new Date(2026, 6, 27))).toBe("2026-07");
  });
});

describe("computeShipmentWeightMetrics", () => {
  it("chưa đo DIM → chargeable = kg, Δ = 0", () => {
    const m = computeShipmentWeightMetrics(
      sample({ sessionDate: "2026-07-27", kg: 100, dimWeightKg: null, dimLines: null })
    );
    expect(m.hasDim).toBe(false);
    expect(m.actualKg).toBe(100);
    expect(m.dimKg).toBe(0);
    expect(m.chargeableKg).toBe(100);
    expect(m.deltaKg).toBe(0);
  });

  it("DIM > kg → chargeable = DIM, Δ dương", () => {
    const m = computeShipmentWeightMetrics(
      sample({ sessionDate: "2026-07-27", kg: 100, dimWeightKg: 120, dimLines: null })
    );
    expect(m.hasDim).toBe(true);
    expect(m.chargeableKg).toBe(120);
    expect(m.deltaKg).toBe(20);
  });

  it("kg ≥ DIM → chargeable = kg, Δ = 0", () => {
    const m = computeShipmentWeightMetrics(
      sample({ sessionDate: "2026-07-27", kg: 150, dimWeightKg: 120, dimLines: null })
    );
    expect(m.chargeableKg).toBe(150);
    expect(m.deltaKg).toBe(0);
  });
});

describe("computeOpsStats", () => {
  const rows: Shipment[] = [
    sample({
      id: "a",
      sessionDate: "2026-07-27",
      warehouse: "TECS-TCS",
      pcs: 10,
      kg: 100,
      dimWeightKg: 120,
    }),
    sample({
      id: "b",
      sessionDate: "2026-07-27",
      warehouse: "TECS-SCSC",
      pcs: 5,
      kg: 50,
      dimWeightKg: null,
    }),
    sample({
      id: "c",
      sessionDate: "2026-07-26",
      warehouse: "TECS-TCS",
      pcs: 2,
      kg: 20,
      dimWeightKg: 20,
    }),
  ];

  it("lọc hôm nay + tất cả kho", () => {
    const r = computeOpsStats(rows, {
      fromYmd: "2026-07-27",
      toYmd: "2026-07-27",
      warehouse: "ALL",
    });
    expect(r.totals.lots).toBe(2);
    expect(r.totals.pcs).toBe(15);
    expect(r.totals.actualKg).toBe(150);
    expect(r.totals.dimKg).toBe(120);
    expect(r.totals.chargeableKg).toBe(170); // 120 + 50
    expect(r.totals.deltaKg).toBe(20);
    expect(r.totals.missingDimLots).toBe(1);
    expect(r.byDay).toHaveLength(1);
    expect(r.lots).toHaveLength(2);
    expect(r.byWarehouse.find((w) => w.warehouse === "TECS-TCS")?.lots).toBe(1);
    expect(r.byWarehouse.find((w) => w.warehouse === "TECS-SCSC")?.lots).toBe(1);
  });

  it("lọc theo kho", () => {
    const r = computeOpsStats(rows, {
      fromYmd: "2026-07-01",
      toYmd: "2026-07-31",
      warehouse: "TECS-TCS",
    });
    expect(r.totals.lots).toBe(2);
    expect(r.totals.missingDimLots).toBe(0);
  });

  it("gom theo dest + lọc dest", () => {
    const withDest: Shipment[] = [
      sample({
        id: "d1",
        sessionDate: "2026-07-27",
        dest: "kul",
        pcs: 1,
        kg: 10,
        dimWeightKg: 10,
      }),
      sample({
        id: "d2",
        sessionDate: "2026-07-27",
        dest: "KUL",
        pcs: 2,
        kg: 20,
        dimWeightKg: null,
      }),
      sample({
        id: "d3",
        sessionDate: "2026-07-27",
        dest: "SIN",
        pcs: 3,
        kg: 30,
        dimWeightKg: 40,
      }),
    ];
    const all = computeOpsStats(withDest, {
      fromYmd: "2026-07-27",
      toYmd: "2026-07-27",
    });
    expect(all.byDest.find((d) => d.dest === "KUL")?.lots).toBe(2);
    expect(all.byDest.find((d) => d.dest === "SIN")?.lots).toBe(1);

    const onlySin = computeOpsStats(withDest, {
      fromYmd: "2026-07-27",
      toYmd: "2026-07-27",
      dest: "SIN",
    });
    expect(onlySin.totals.lots).toBe(1);
    expect(onlySin.lots[0]?.shipment.dest).toBe("SIN");
  });
});
