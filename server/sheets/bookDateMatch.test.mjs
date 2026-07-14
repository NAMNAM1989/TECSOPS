import { describe, expect, it } from "vitest";
import {
  extractCutoffOpsDateToken,
  filterRowsForSessionDate,
  rowMatchesSessionDate,
  sessionYmdToFlightDateToken,
} from "./bookDateMatch.mjs";

describe("bookDateMatch", () => {
  it("sessionYmdToFlightDateToken", () => {
    expect(sessionYmdToFlightDateToken("2026-06-13")).toBe("13JUN");
  });

  it("extractCutoffOpsDateToken", () => {
    expect(extractCutoffOpsDateToken("17:00 - 13JUN")).toBe("13JUN");
    expect(extractCutoffOpsDateToken("BUP 1 PMC")).toBe("");
    expect(extractCutoffOpsDateToken("PER")).toBe("");
  });

  it("giữ lô cutoff 13JUN dù chuyến bay 14JUN", () => {
    const row = { flightDate: "14JUN", cutoffNote: "13JUN" };
    expect(rowMatchesSessionDate(row, "2026-06-13")).toBe(true);
  });

  it("giữ lô chuyến bay 14JUN khi tab đã đúng ngày (không có cutoff)", () => {
    const row = { flightDate: "14JUN", cutoffNote: "" };
    expect(rowMatchesSessionDate(row, "2026-06-13")).toBe(true);
  });

  it("bỏ lô cutoff ghi ngày khác phiên", () => {
    const row = { flightDate: "14JUN", cutoffNote: "14JUN" };
    expect(rowMatchesSessionDate(row, "2026-06-13")).toBe(false);
  });

  it("giữ lô không ghi ngày (tab đã đúng ngày)", () => {
    const row = { flightDate: "", cutoffNote: "" };
    expect(rowMatchesSessionDate(row, "2026-06-13")).toBe(true);
  });

  it("filterRowsForSessionDate", () => {
    const rows = [
      { flightDate: "14JUN", cutoffNote: "13JUN" },
      { flightDate: "14JUN", cutoffNote: "" },
      { flightDate: "14JUN", cutoffNote: "14JUN" },
    ];
    expect(filterRowsForSessionDate(rows, "2026-06-13")).toHaveLength(2);
  });
});
