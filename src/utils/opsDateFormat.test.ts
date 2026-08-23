import { describe, expect, it } from "vitest";
import { formatOpsWorkDate, formatOpsWorkDateYmd } from "./opsDateFormat";

describe("formatOpsWorkDate", () => {
  it("formats local Date as DD-MON-YYYY", () => {
    expect(formatOpsWorkDate(new Date(2026, 7, 23))).toBe("23-AUG-2026");
    expect(formatOpsWorkDate(new Date(2026, 0, 5))).toBe("05-JAN-2026");
  });

  it("formats session ymd the same way", () => {
    expect(formatOpsWorkDateYmd("2026-08-23")).toBe("23-AUG-2026");
    expect(formatOpsWorkDateYmd("2026-12-01")).toBe("01-DEC-2026");
  });
});
