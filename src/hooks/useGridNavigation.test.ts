import { describe, expect, it } from "vitest";
import { TABLE_COLUMN_ORDER, type TableGridField } from "../config/tableUx";
import { getNextGridCell, type ActiveGridCell } from "./useGridNavigation";

describe("useGridNavigation - getNextGridCell", () => {
  const rowIds = ["row-1", "row-2", "row-3"];
  const fields = TABLE_COLUMN_ORDER; // ['awb', 'hawb', 'flight', 'flightDate', 'dest', 'pcs', 'kg', 'dimKg', 'customer', 'note']

  it("mũi tên up / down di chuyển cùng cột giữa các dòng", () => {
    const current: ActiveGridCell = { rowId: "row-2", field: "flight" };

    const up = getNextGridCell(current, "up", rowIds, fields);
    expect(up).toEqual({ rowId: "row-1", field: "flight" });

    const down = getNextGridCell(current, "down", rowIds, fields);
    expect(down).toEqual({ rowId: "row-3", field: "flight" });

    // Biên trên cùng
    const upFromTop = getNextGridCell({ rowId: "row-1", field: "flight" }, "up", rowIds, fields);
    expect(upFromTop).toEqual({ rowId: "row-1", field: "flight" });

    // Biên dưới cùng
    const downFromBottom = getNextGridCell({ rowId: "row-3", field: "flight" }, "down", rowIds, fields);
    expect(downFromBottom).toEqual({ rowId: "row-3", field: "flight" });
  });

  it("mũi tên left / right di chuyển cùng hàng giữa các cột", () => {
    const current: ActiveGridCell = { rowId: "row-1", field: "flight" };

    const left = getNextGridCell(current, "left", rowIds, fields);
    expect(left).toEqual({ rowId: "row-1", field: "hawb" });

    const right = getNextGridCell(current, "right", rowIds, fields);
    expect(right).toEqual({ rowId: "row-1", field: "flightDate" });

    // Biên trái nhất (awb)
    const leftFromStart = getNextGridCell({ rowId: "row-1", field: "awb" }, "left", rowIds, fields);
    expect(leftFromStart).toEqual({ rowId: "row-1", field: "awb" });

    // Biên phải nhất (note)
    const rightFromEnd = getNextGridCell({ rowId: "row-1", field: "note" }, "right", rowIds, fields);
    expect(rightFromEnd).toEqual({ rowId: "row-1", field: "note" });
  });

  it("Tab (next) sang cột kế tiếp, hết dòng nhảy sang cột đầu của dòng sau", () => {
    // Giữa dòng
    const next1 = getNextGridCell({ rowId: "row-1", field: "pcs" }, "next", rowIds, fields);
    expect(next1).toEqual({ rowId: "row-1", field: "kg" });

    // Cuối dòng 1 ('note') -> sang đầu dòng 2 ('awb')
    const nextRow = getNextGridCell({ rowId: "row-1", field: "note" }, "next", rowIds, fields);
    expect(nextRow).toEqual({ rowId: "row-2", field: "awb" });

    // Cuối dòng cuối cùng -> dừng lại
    const lastCell = getNextGridCell({ rowId: "row-3", field: "note" }, "next", rowIds, fields);
    expect(lastCell).toEqual({ rowId: "row-3", field: "note" });
  });

  it("Shift+Tab (prev) sang cột trước, đầu dòng nhảy sang cột cuối của dòng trước", () => {
    // Giữa dòng
    const prev1 = getNextGridCell({ rowId: "row-2", field: "kg" }, "prev", rowIds, fields);
    expect(prev1).toEqual({ rowId: "row-2", field: "pcs" });

    // Đầu dòng 2 ('awb') -> sang cuối dòng 1 ('note')
    const prevRow = getNextGridCell({ rowId: "row-2", field: "awb" }, "prev", rowIds, fields);
    expect(prevRow).toEqual({ rowId: "row-1", field: "note" });

    // Đầu dòng 1 ('awb') -> dừng lại
    const firstCell = getNextGridCell({ rowId: "row-1", field: "awb" }, "prev", rowIds, fields);
    expect(firstCell).toEqual({ rowId: "row-1", field: "awb" });
  });

  it("trả về null nếu không tìm thấy rowId hoặc field", () => {
    const invalid = getNextGridCell({ rowId: "unknown", field: "pcs" }, "down", rowIds, fields);
    expect(invalid).toBeNull();

    const invalidField = getNextGridCell({ rowId: "row-1", field: "invalidField" as TableGridField }, "down", rowIds, fields);
    expect(invalidField).toBeNull();
  });
});
