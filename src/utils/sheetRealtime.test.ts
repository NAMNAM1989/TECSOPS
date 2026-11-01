import { describe, expect, it } from "vitest";
import { describeSheetConflicts, formatSheetSyncTime } from "./sheetRealtime";

describe("sheetRealtime", () => {
  it("formatSheetSyncTime → HH:mm:ss, rỗng khi thiếu/sai", () => {
    expect(formatSheetSyncTime("2026-10-14T05:06:07Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatSheetSyncTime(null)).toBe("");
    expect(formatSheetSyncTime("abc")).toBe("");
  });

  it("describeSheetConflicts gọn tối đa 3 dòng", () => {
    const conflicts = Array.from({ length: 5 }, (_, i) => ({
      awb: `618-1111 000${i}`,
      code: "awb_taken",
      reason: "AWB đã có phiên 2026-10-10",
      rowNumber: i + 2,
    }));
    const text = describeSheetConflicts(conflicts);
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("dòng 2");
    expect(text).toContain("(+2 dòng khác)");
  });
});
