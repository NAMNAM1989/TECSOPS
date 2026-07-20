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

  it("giữ mọi dòng trên tab — kể cả cutoff ngày khác phiên", () => {
    expect(rowMatchesSessionDate({ flightDate: "14JUN", cutoffNote: "13JUN" }, "2026-06-13")).toBe(
      true
    );
    expect(rowMatchesSessionDate({ flightDate: "14JUN", cutoffNote: "14JUN" }, "2026-06-13")).toBe(
      true
    );
    expect(rowMatchesSessionDate({ flightDate: "21JUL", cutoffNote: "10:30 - 21JUL" }, "2026-07-20")).toBe(
      true
    );
    expect(rowMatchesSessionDate({ flightDate: "", cutoffNote: "" }, "2026-06-13")).toBe(true);
  });

  it("sessionDate không hợp lệ → không khớp", () => {
    expect(rowMatchesSessionDate({ cutoffNote: "13JUN" }, "bad")).toBe(false);
  });

  it("filterRowsForSessionDate giữ toàn bộ khi tab đã đúng ngày", () => {
    const rows = [
      { flightDate: "14JUN", cutoffNote: "13JUN" },
      { flightDate: "14JUN", cutoffNote: "" },
      { flightDate: "14JUN", cutoffNote: "14JUN" },
      { flightDate: "21JUL", cutoffNote: "10:30 - 21JUL", customer: "A TÚ" },
    ];
    expect(filterRowsForSessionDate(rows, "2026-06-13")).toHaveLength(4);
    expect(filterRowsForSessionDate(rows, "2026-07-20")).toHaveLength(4);
    expect(filterRowsForSessionDate(rows, "")).toHaveLength(0);
  });
});
