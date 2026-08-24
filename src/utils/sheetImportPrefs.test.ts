import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSheetColMapping,
  loadSheetColMapping,
  loadSheetWarehouseFilter,
  saveSheetColMapping,
  saveSheetWarehouseFilter,
  sheetHeaderFingerprint,
} from "./sheetImportPrefs";

describe("sheetImportPrefs", () => {
  beforeEach(() => {
    clearSheetColMapping();
    saveSheetWarehouseFilter("ALL");
  });

  it("lưu / khôi phục warehouse filter", () => {
    saveSheetWarehouseFilter("TECS-TCS");
    expect(loadSheetWarehouseFilter()).toBe("TECS-TCS");
  });

  it("lưu mapping theo spreadsheetId", () => {
    saveSheetColMapping({
      headerFingerprint: "awb|kho",
      colMap: { awb: 1, warehouse: 5 },
      updatedAt: "2026-08-07T00:00:00.000Z",
      spreadsheetId: "sheet-abc",
    });
    expect(loadSheetColMapping("sheet-abc")?.colMap.awb).toBe(1);
    expect(loadSheetColMapping("other")).toBeNull();
  });

  it("fingerprint ổn định", () => {
    expect(sheetHeaderFingerprint(["AWB", "Kho hàng"])).toBe(
      sheetHeaderFingerprint(["awb", "kho hang"])
    );
  });
});
