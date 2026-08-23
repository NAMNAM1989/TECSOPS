import { describe, expect, it } from "vitest";
import {
  formatStatsPeriodLabel,
  formatWeekEmptyCopy,
  formatWeekRangeLabel,
  resolveStatsPeriodRange,
  shiftStatsPeriodAnchor,
  STATS_DISPLAY_TIME_ZONE,
  todayYmdAsiaSaigon,
  weekEndYmd,
  weekStartYmd,
  weekYmdToRange,
} from "./opsStatsPeriod";

describe("weekStartYmd / weekEndYmd (Postgres date_trunc('week'))", () => {
  it("Monday → chính tuần đó; Sunday → lùi về Monday", () => {
    expect(weekStartYmd("2026-08-17")).toBe("2026-08-17");
    expect(weekEndYmd("2026-08-17")).toBe("2026-08-23");
    expect(weekStartYmd("2026-08-23")).toBe("2026-08-17");
    expect(weekEndYmd("2026-08-23")).toBe("2026-08-23");
  });

  it("mọi ngày trong tuần 17–23/8 snap cùng Monday–Sunday", () => {
    for (const day of ["17", "18", "19", "20", "21", "22", "23"]) {
      expect(weekYmdToRange(`2026-08-${day}`)).toEqual({
        fromYmd: "2026-08-17",
        toYmd: "2026-08-23",
      });
    }
  });

  it("tuần trước 10–16/8", () => {
    expect(weekYmdToRange("2026-08-16")).toEqual({
      fromYmd: "2026-08-10",
      toYmd: "2026-08-16",
    });
    expect(weekStartYmd("2026-08-12")).toBe("2026-08-10");
    expect(weekEndYmd("2026-08-10")).toBe("2026-08-16");
  });

  it("tuần vượt năm: CN 2026-01-04 → T2 2025-12-29", () => {
    expect(weekYmdToRange("2026-01-01")).toEqual({
      fromYmd: "2025-12-29",
      toYmd: "2026-01-04",
    });
    expect(weekYmdToRange("2026-01-04")).toEqual({
      fromYmd: "2025-12-29",
      toYmd: "2026-01-04",
    });
    expect(weekYmdToRange("2026-01-05")).toEqual({
      fromYmd: "2026-01-05",
      toYmd: "2026-01-11",
    });
  });

  it("YMD không hợp lệ → null (không crash)", () => {
    expect(weekStartYmd("")).toBeNull();
    expect(weekEndYmd("not-a-date")).toBeNull();
    expect(weekYmdToRange("2026-13-40")).toBeNull();
    expect(weekStartYmd("2026-02-30")).toBeNull();
  });
});

describe("resolveStatsPeriodRange week", () => {
  it("snap mốc bất kỳ về Monday–Sunday inclusive", () => {
    expect(
      resolveStatsPeriodRange({
        mode: "week",
        weekYmd: "2026-08-20",
        todayYmd: "2026-08-23",
      })
    ).toEqual({ fromYmd: "2026-08-17", toYmd: "2026-08-23" });
  });

  it("thiếu weekYmd → tuần chứa today", () => {
    expect(resolveStatsPeriodRange({ mode: "week", todayYmd: "2026-08-16" })).toEqual({
      fromYmd: "2026-08-10",
      toYmd: "2026-08-16",
    });
  });

  it("không phá day / month / year / range", () => {
    expect(resolveStatsPeriodRange({ mode: "today", todayYmd: "2026-08-23" })).toEqual({
      fromYmd: "2026-08-23",
      toYmd: "2026-08-23",
    });
    expect(
      resolveStatsPeriodRange({ mode: "day", dayYmd: "2026-08-01", todayYmd: "2026-08-23" })
    ).toEqual({ fromYmd: "2026-08-01", toYmd: "2026-08-01" });
    expect(
      resolveStatsPeriodRange({ mode: "month", monthYm: "2026-08", todayYmd: "2026-08-23" })
    ).toEqual({ fromYmd: "2026-08-01", toYmd: "2026-08-31" });
    expect(resolveStatsPeriodRange({ mode: "year", year: 2026, todayYmd: "2026-08-23" })).toEqual({
      fromYmd: "2026-01-01",
      toYmd: "2026-12-31",
    });
    expect(
      resolveStatsPeriodRange({
        mode: "range",
        rangeFromYmd: "2026-08-01",
        rangeToYmd: "2026-08-07",
      })
    ).toEqual({ fromYmd: "2026-08-01", toYmd: "2026-08-07" });
  });
});

describe("shiftStatsPeriodAnchor week", () => {
  it("lùi/tiến đúng 7 ngày và hạ về Monday", () => {
    expect(shiftStatsPeriodAnchor("week", "2026-08-20", -1)).toBe("2026-08-10");
    expect(shiftStatsPeriodAnchor("week", "2026-08-17", 1)).toBe("2026-08-24");
    expect(shiftStatsPeriodAnchor("week", "2026-08-23", -1)).toBe("2026-08-10");
  });
});

describe("formatWeekRangeLabel", () => {
  it("cùng tháng: 17–23 AUG 2026", () => {
    expect(formatWeekRangeLabel("2026-08-17", "2026-08-23")).toBe("17–23 AUG 2026");
  });

  it("sang tháng / sang năm", () => {
    expect(formatWeekRangeLabel("2026-08-31", "2026-09-06")).toBe("31 AUG – 6 SEP 2026");
    expect(formatWeekRangeLabel("2025-12-29", "2026-01-04")).toBe("29 DEC 2025 – 4 JAN 2026");
  });

  it("formatStatsPeriodLabel week có T2–CN", () => {
    expect(
      formatStatsPeriodLabel({ fromYmd: "2026-08-17", toYmd: "2026-08-23" }, "week")
    ).toBe("T2–CN · 17–23 AUG 2026");
  });
});

describe("formatWeekEmptyCopy", () => {
  it("nhắc khoảng tuần đã chọn, không nói «Tuần này trống»", () => {
    const other = formatWeekEmptyCopy("10–16 AUG 2026");
    expect(other.title).toBe("Tuần 10–16 AUG 2026 trống");
    expect(other.title).not.toMatch(/Tuần này/);
    expect(other.description).not.toMatch(/Tuần này trống/);

    const current = formatWeekEmptyCopy("17–23 AUG 2026");
    expect(current.title).toBe("Tuần 17–23 AUG 2026 trống");
    expect(current.description).toContain("tuần đã chọn");
  });
});

describe("todayYmdAsiaSaigon", () => {
  it("múi giờ Asia/Saigon, không dùng UTC calendar", () => {
    expect(STATS_DISPLAY_TIME_ZONE).toBe("Asia/Saigon");
    // 23/8 23:30 ICT = 16:30 UTC cùng ngày
    expect(todayYmdAsiaSaigon(new Date("2026-08-23T16:30:00.000Z"))).toBe("2026-08-23");
    // 00:00 ICT 24/8 = 17:00 UTC 23/8
    expect(todayYmdAsiaSaigon(new Date("2026-08-23T17:00:00.000Z"))).toBe("2026-08-24");
  });
});
