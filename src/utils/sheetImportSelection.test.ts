import { describe, expect, it } from "vitest";
import { isSheetRowSelectable, type SheetBookSyncRow } from "../types/googleSheetBook";
import { normalizeWarehouse } from "../constants/warehouses";
import type { Warehouse } from "../types/shipment";

type WarehouseFilter = Warehouse | "ALL";

function rowWarehouse(row: Pick<SheetBookSyncRow, "warehouse">): Warehouse {
  return normalizeWarehouse(row.warehouse);
}

/** Mirror GoogleSheetImportModal — chọn mọi dòng nhập được cả 2 kho. */
function selectAllImportable(rows: SheetBookSyncRow[]): Set<number> {
  const next = new Set<number>();
  for (const row of rows) {
    if (isSheetRowSelectable(row)) next.add(row.index);
  }
  return next;
}

function selectImportableInFilter(rows: SheetBookSyncRow[], filter: WarehouseFilter): Set<number> {
  if (filter === "ALL") return selectAllImportable(rows);
  const next = new Set<number>();
  for (const row of rows) {
    if (!isSheetRowSelectable(row)) continue;
    if (rowWarehouse(row) !== filter) continue;
    next.add(row.index);
  }
  return next;
}

function row(
  index: number,
  warehouse: string,
  syncStatus: SheetBookSyncRow["syncStatus"]
): SheetBookSyncRow {
  return {
    index,
    sheetRowIndex: index,
    blockTitle: "",
    awb: `000-0000 ${String(index).padStart(4, "0")}`,
    flight: "VN001",
    flightDate: "22JUL",
    dest: "SIN",
    warehouse,
    pcs: 1,
    kg: 10,
    customer: "TEST",
    customerCode: "",
    customerKnown: false,
    syncStatus,
    duplicate: syncStatus === "duplicate",
    needsUpdate: syncStatus === "update",
    blocked: syncStatus === "duplicate" || syncStatus === "sheet_duplicate" || syncStatus === "awb_taken",
    sheetDuplicateOfIndex: null,
    takenSessionDate: null,
    existingWarehouse: null,
    duplicateId: null,
  };
}

describe("sheet import selection — cả TCS và SCSC", () => {
  const rows = [
    row(0, "TECS-TCS", "new"),
    row(1, "TECS-TCS", "duplicate"),
    row(2, "TECS-SCSC", "new"),
    row(3, "TECS-SCSC", "update"),
    row(4, "TECS-SCSC", "duplicate"),
  ];

  it("mặc định chọn cả TCS mới và SCSC mới/cập nhật", () => {
    const selected = selectAllImportable(rows);
    expect([...selected].sort()).toEqual([0, 2, 3]);
  });

  it("lọc xem SCSC không được dùng làm mặc định chọn (tránh bỏ TCS)", () => {
    // Chip lọc chỉ thu hẹp «Chọn tất cả mới · kho», không phải selection mở modal.
    const onlyScsc = selectImportableInFilter(rows, "TECS-SCSC");
    expect([...onlyScsc].sort()).toEqual([2, 3]);
    const all = selectAllImportable(rows);
    expect(all.has(0)).toBe(true);
    expect(all.has(2)).toBe(true);
  });

  it("lọc TCS không nuốt SCSC khi chọn tất cả", () => {
    const onlyTcs = selectImportableInFilter(rows, "TECS-TCS");
    expect([...onlyTcs]).toEqual([0]);
    // Selection mặc định vẫn phải gồm SCSC
    expect(selectAllImportable(rows).has(2)).toBe(true);
  });
});
