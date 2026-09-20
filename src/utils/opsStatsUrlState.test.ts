import { describe, expect, it } from "vitest";
import {
  formatPctDeltaLabel,
  pctDelta,
  previousStatsPeriodRange,
  resolveStatsPeriodRange,
  statsRangeDayCount,
} from "./opsStatsPeriod";
import {
  isStatsHash,
  parseOpsStatsUrlState,
  serializeOpsStatsUrlState,
} from "./opsStatsUrlState";

describe("previousStatsPeriodRange", () => {
  it("today/day → ngày trước", () => {
    expect(
      previousStatsPeriodRange({ fromYmd: "2026-09-18", toYmd: "2026-09-18" }, "today")
    ).toEqual({ fromYmd: "2026-09-17", toYmd: "2026-09-17" });
  });

  it("week → −7 ngày (T2–CN)", () => {
    const cur = resolveStatsPeriodRange({
      mode: "week",
      weekYmd: "2026-09-17",
      todayYmd: "2026-09-17",
    });
    const prev = previousStatsPeriodRange(cur, "week");
    expect(prev.fromYmd).toBe("2026-09-07");
    expect(prev.toYmd).toBe("2026-09-13");
  });

  it("month / range", () => {
    expect(
      previousStatsPeriodRange({ fromYmd: "2026-09-01", toYmd: "2026-09-30" }, "month")
    ).toEqual({ fromYmd: "2026-08-01", toYmd: "2026-08-31" });
    expect(
      previousStatsPeriodRange({ fromYmd: "2026-01-01", toYmd: "2026-12-31" }, "year")
    ).toEqual({ fromYmd: "2025-01-01", toYmd: "2025-12-31" });
  });

  it("range lùi bằng độ dài", () => {
    expect(statsRangeDayCount({ fromYmd: "2026-09-10", toYmd: "2026-09-12" })).toBe(3);
    expect(
      previousStatsPeriodRange({ fromYmd: "2026-09-10", toYmd: "2026-09-12" }, "range")
    ).toEqual({ fromYmd: "2026-09-07", toYmd: "2026-09-09" });
  });
});

describe("pctDelta", () => {
  it("tính % và nhãn", () => {
    expect(pctDelta(12, 10)).toBe(20);
    expect(pctDelta(10, 10)).toBe(0);
    expect(formatPctDeltaLabel(null, 5, 0)).toBe("mới");
    expect(formatPctDeltaLabel(20, 12, 10)).toBe("+20%");
  });
});

describe("opsStatsUrlState", () => {
  it("round-trip serialize/parse", () => {
    const hash = serializeOpsStatsUrlState({
      mode: "week",
      dayYmd: "2026-09-18",
      weekYmd: "2026-09-15",
      monthYm: "2026-09",
      year: 2026,
      rangeFrom: "2026-09-01",
      rangeTo: "2026-09-18",
      warehouse: "TECS-TCS",
      dest: "SIN",
      customerKey: "code:LNE",
      flightKey: "SQ185",
      statuses: ["PENDING", "RECEIVED"],
      intelTab: "booking",
      detailTab: "lots",
      focusYmd: "2026-09-18",
      sort: null,
    });
    expect(isStatsHash(hash)).toBe(true);
    const parsed = parseOpsStatsUrlState(hash);
    expect(parsed.mode).toBe("week");
    expect(parsed.warehouse).toBe("TECS-TCS");
    expect(parsed.dest).toBe("SIN");
    expect(parsed.flightKey).toBe("SQ185");
    expect(parsed.intelTab).toBe("booking");
    expect(parsed.statuses).toEqual(["PENDING", "RECEIVED"]);
    expect(parsed.focusYmd).toBe("2026-09-18");
  });
});
