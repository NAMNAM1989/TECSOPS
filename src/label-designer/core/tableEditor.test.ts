import { describe, expect, it } from "vitest";
import { createTableObject } from "../designer/objectFactories";
import {
  isTableCellCovered,
  mergeTableCells,
  patchTableCell,
  setTableColWidth,
  unmergeTableCell,
} from "./tableEditor";

describe("tableEditor", () => {
  it("merge covers slave cells", () => {
    const t = mergeTableCells(createTableObject(), 0, 0, 0, 1);
    expect(isTableCellCovered(t, 0, 1)).toBe(true);
    expect(t.cells["0:0"]?.colSpan).toBe(2);
  });

  it("unmerge restores grid", () => {
    const merged = mergeTableCells(createTableObject(), 0, 0, 1, 1);
    const split = unmergeTableCell(merged, 1, 1);
    expect(isTableCellCovered(split, 1, 1)).toBe(false);
  });

  it("patchTableCell updates master", () => {
    const merged = mergeTableCells(createTableObject(), 0, 0, 0, 1);
    const patched = patchTableCell(merged, 0, 1, { text: "X" });
    expect(patched.cells["0:0"]?.text).toBe("X");
  });

  it("setTableColWidth updates total width", () => {
    const t = createTableObject();
    const next = setTableColWidth(t, 0, 40);
    expect(next.colWidths[0]).toBe(40);
    expect(next.width).toBe(next.colWidths.reduce((a, b) => a + b, 0));
  });
});
