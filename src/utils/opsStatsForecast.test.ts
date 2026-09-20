import { describe, expect, it } from "vitest";
import { blankShipmentDraft } from "./blankShipment";
import type { Shipment } from "../types/shipment";
import {
  computeNextWeekLaneSuggestions,
  computeSevenDayForecast,
  computeWeeklyShareSparkline,
  nextSevenYmds,
  pickMissLanes,
} from "./opsStatsForecast";
import { parseLotSortParam, sortOpsStatsLots, toggleLotSort } from "./opsStatsLotSort";
import { computeShipmentWeightMetrics } from "./opsStatsMetrics";

function sample(
  partial: Partial<Shipment> & { sessionDate: string; id: string }
): Shipment {
  const base = blankShipmentDraft(partial.sessionDate, partial.warehouse ?? "TECS-TCS");
  return { stt: partial.stt ?? 1, ...base, ...partial };
}

describe("nextSevenYmds / forecast", () => {
  it("7 ngày tới từ mốc", () => {
    expect(nextSevenYmds("2026-09-18")).toEqual([
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
  });

  it("forecast chỉ ngày đủ n≥2", () => {
    // Fridays before 2026-09-25 (Fri): 09-18, 09-11, 09-04
    const history = [
      sample({ id: "1", sessionDate: "2026-09-18", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "2", sessionDate: "2026-09-11", kg: 20, flight: "SQ185", dest: "SIN" }),
      sample({ id: "3", sessionDate: "2026-09-04", kg: 30, flight: "SQ185", dest: "SIN" }),
    ];
    const fc = computeSevenDayForecast(history, "2026-09-18", 8);
    const fri = fc.find((r) => r.ymd === "2026-09-25");
    expect(fri).toBeTruthy();
    expect(fri!.sampleDays).toBeGreaterThanOrEqual(2);
    expect(fri!.forecastLots).toBeGreaterThan(0);
  });
});

describe("next week lanes + miss", () => {
  it("gợi ý lane khi đủ lịch sử DOW", () => {
    const history = [
      sample({ id: "a", sessionDate: "2026-09-11", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "b", sessionDate: "2026-09-04", kg: 10, flight: "SQ185", dest: "SIN" }),
      sample({ id: "c", sessionDate: "2026-09-18", kg: 10, flight: "AK521", dest: "KUL" }),
      sample({ id: "d", sessionDate: "2026-09-11", kg: 5, flight: "AK521", dest: "KUL" }),
    ];
    const sug = computeNextWeekLaneSuggestions(history, "2026-09-18", {
      topPerDay: 2,
      maxTotal: 20,
    });
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.some((s) => s.flightKey === "SQ185" || s.flightKey === "AK521")).toBe(true);
  });

  it("pickMissLanes", () => {
    const miss = pickMissLanes([
      {
        flightKey: "SQ185",
        dest: "SIN",
        lots: 0,
        actualKg: 0,
        baselineLots: 2,
        baselineKg: 100,
        surgeLots: 0,
        signal: "miss",
      },
      {
        flightKey: "AK521",
        dest: "KUL",
        lots: 3,
        actualKg: 50,
        baselineLots: 1,
        baselineKg: 10,
        surgeLots: 3,
        signal: "surge",
      },
    ]);
    expect(miss).toHaveLength(1);
    expect(miss[0]!.flightKey).toBe("SQ185");
  });
});

describe("sparkline share", () => {
  it("≥ điểm khi có nhiều tuần", () => {
    const history: Shipment[] = [];
    // Several Fridays with customer A
    for (const d of ["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11", "2026-09-18"]) {
      history.push(
        sample({
          id: `a-${d}`,
          sessionDate: d,
          kg: 100,
          customerCode: "AAA",
          customer: "Alpha",
          flight: "SQ1",
          dest: "SIN",
        }),
        sample({
          id: `b-${d}`,
          sessionDate: d,
          kg: 100,
          customerCode: "BBB",
          customer: "Beta",
          flight: "SQ1",
          dest: "SIN",
        })
      );
    }
    const pts = computeWeeklyShareSparkline(history, {
      kind: "customer",
      matchKey: "code:AAA",
      beforeYmd: "2026-09-20",
      weeks: 8,
    });
    expect(pts.length).toBeGreaterThanOrEqual(4);
    expect(pts.every((p) => p.shareKgPct === 50)).toBe(true);
  });
});

describe("lot sort", () => {
  it("parse / toggle / sort delta desc", () => {
    expect(parseLotSortParam("delta:desc")).toEqual({ key: "delta", dir: "desc" });
    expect(toggleLotSort(null, "delta")).toEqual({ key: "delta", dir: "desc" });
    const lots = [
      {
        shipment: sample({ id: "1", sessionDate: "2026-09-18", awb: "A", kg: 10 }),
        pcs: 1,
        ...computeShipmentWeightMetrics(
          sample({ id: "1", sessionDate: "2026-09-18", kg: 10, dimWeightKg: 40 })
        ),
      },
      {
        shipment: sample({ id: "2", sessionDate: "2026-09-18", awb: "B", kg: 10 }),
        pcs: 1,
        ...computeShipmentWeightMetrics(
          sample({ id: "2", sessionDate: "2026-09-18", kg: 10, dimWeightKg: 15 })
        ),
      },
    ];
    const sorted = sortOpsStatsLots(lots, { key: "delta", dir: "desc" });
    expect(sorted[0]!.shipment.id).toBe("1");
  });
});
