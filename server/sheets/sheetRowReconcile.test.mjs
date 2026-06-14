import { describe, expect, it } from "vitest";
import {
  findExistingInSession,
  sheetRowNeedsUpdate,
  sheetRowSyncStatus,
} from "./sheetRowReconcile.mjs";

const customers = [{ id: "c1", name: "TÍN PHÁT", code: "TP" }];

function lookupCode(_customers, name) {
  if (String(name).toLowerCase() === "tín phát") return "TP";
  return "";
}

function lookupId(_customers, name) {
  if (String(name).toLowerCase() === "tín phát") return "c1";
  return "";
}

describe("sheetRowReconcile", () => {
  const state = {
    rows: [
      {
        id: "new-1",
        sessionDate: "2026-06-13",
        awb: "235-4501 1960",
        warehouse: "TECS-TCS",
        customer: "",
        flight: "TK163",
        flightDate: "14JUN",
        cutoff: "17:00",
        cutoffNote: "13JUN",
        dest: "AMS",
        pcs: 78,
        kg: 1258,
        note: "",
        consigneeNamePrint: "",
        customerCode: "",
        customerId: "",
      },
    ],
  };

  it("findExistingInSession theo AWB, không phụ thuộc kho", () => {
    const hit = findExistingInSession(state, "2026-06-13", "235-4501 1960");
    expect(hit?.id).toBe("new-1");
  });

  it("phát hiện cần cập nhật khi sai kho hoặc thiếu khách", () => {
    const row = {
      awb: "235-4501 1960",
      warehouse: "TECS-SCSC",
      customer: "TÍN PHÁT",
      flight: "TK163",
      flightDate: "14JUN",
      cutoff: "17:00",
      cutoffNote: "13JUN",
      dest: "AMS",
      pcs: 78,
      kg: 1258,
      note: "13JUN",
      consigneeNamePrint: "VERTEX",
    };
    expect(
      sheetRowSyncStatus(
        state.rows[0],
        row,
        "2026-06-13",
        customers,
        lookupCode,
        lookupId
      )
    ).toBe("update");
    expect(
      sheetRowNeedsUpdate(
        state.rows[0],
        row,
        "2026-06-13",
        customers,
        lookupCode,
        lookupId
      )
    ).toBe(true);
  });
});
