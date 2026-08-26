import { describe, expect, it } from "vitest";
import { buildSheetBookEditUrl } from "./googleSheetBookApi";

describe("buildSheetBookEditUrl", () => {
  it("không gắn gid khi thiếu — tránh giữ tab ngày khác trong URL", () => {
    expect(buildSheetBookEditUrl("abc123")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit"
    );
    expect(buildSheetBookEditUrl("abc123", "")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit"
    );
    expect(buildSheetBookEditUrl("abc123", "   ")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit"
    );
  });

  it("gắn gid tab đã resolve theo ngày phiên", () => {
    expect(buildSheetBookEditUrl("abc123", "928921597")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/edit?gid=928921597#gid=928921597"
    );
  });
});
