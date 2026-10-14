import { describe, it, expect } from "vitest";
import { parseTsv, formatTsv } from "./tsvParser";

describe("tsvParser", () => {
  it("parses simple tab-separated values", () => {
    const raw = "123\t456\t789\nA1\tB1\tC1";
    const res = parseTsv(raw);
    expect(res).toEqual([
      ["123", "456", "789"],
      ["A1", "B1", "C1"],
    ]);
  });

  it("handles CRLF line endings and trailing newlines", () => {
    const raw = "row1_c1\trow1_c2\r\nrow2_c1\trow2_c2\r\n";
    const res = parseTsv(raw);
    expect(res).toEqual([
      ["row1_c1", "row1_c2"],
      ["row2_c1", "row2_c2"],
    ]);
  });

  it("handles quoted cells with tabs and newlines inside", () => {
    const raw = `"line1\nline2"\t"tab\there"\tplain`;
    const res = parseTsv(raw);
    expect(res).toEqual([
      ["line1\nline2", "tab\there", "plain"],
    ]);
  });

  it("handles escaped quotes inside quotes", () => {
    const raw = `"He said ""Hello"""\tnormal`;
    const res = parseTsv(raw);
    expect(res).toEqual([
      ['He said "Hello"', "normal"],
    ]);
  });

  it("formats grid back to TSV string", () => {
    const grid = [
      ["a", "b\tc", "d"],
      ["e\nf", "normal", 'with "quote"'],
    ];
    const tsv = formatTsv(grid);
    const parsed = parseTsv(tsv);
    expect(parsed).toEqual(grid);
  });
});
