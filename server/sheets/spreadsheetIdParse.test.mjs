import { describe, expect, it } from "vitest";
import { parseSpreadsheetIdFromInput, resolveSpreadsheetId } from "./spreadsheetIdParse.mjs";

describe("parseSpreadsheetIdFromInput", () => {
  it("nhận ID thuần", () => {
    expect(parseSpreadsheetIdFromInput("15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4")).toBe(
      "15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4"
    );
  });

  it("trích từ link /edit", () => {
    expect(
      parseSpreadsheetIdFromInput(
        "https://docs.google.com/spreadsheets/d/15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4/edit?usp=sharing"
      )
    ).toBe("15EHqZuuYznL2_VkCnpENHgc_mmBTSJGgrNG3iv5ZvA4");
  });

  it("trích từ link /view", () => {
    expect(
      parseSpreadsheetIdFromInput(
        "https://docs.google.com/spreadsheets/d/abc123XYZ-_/view#gid=0"
      )
    ).toBe("abc123XYZ-_");
  });

  it("chuỗi rỗng → empty", () => {
    expect(parseSpreadsheetIdFromInput("")).toBe("");
    expect(parseSpreadsheetIdFromInput("   ")).toBe("");
  });

  it("link sai → throw", () => {
    expect(() => parseSpreadsheetIdFromInput("https://example.com/not-a-sheet")).toThrow(
      /không hợp lệ/
    );
  });

  it("resolveSpreadsheetId bắt buộc có ID", () => {
    expect(() => resolveSpreadsheetId("")).toThrow(/Thiếu ID/);
  });
});
