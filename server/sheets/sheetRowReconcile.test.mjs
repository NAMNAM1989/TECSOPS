import { describe, expect, it } from "vitest";
import {
  awbKeyForMatch,
  blankBookingMatchesSheetRow,
  findBlankAwbBookingInSession,
  findExistingInSession,
  findExistingOtherSession,
  resolveExistingForSheetRow,
  resolveSheetRowSyncStatus,
  sheetAwbFirstIndexByKey,
  sheetRowIsBlocked,
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

  it("phát hiện AWB trùng trong cùng batch Sheet", () => {
    const rows = [
      { awb: "235-4501 1960" },
      { awb: "235 45011960" },
    ];
    const first = sheetAwbFirstIndexByKey(rows);
    const key = awbKeyForMatch(rows[0].awb);
    expect(first.get(key)).toBe(0);

    const resolved = resolveSheetRowSyncStatus(
      { existing: null, otherSession: null, sheetFirstIndex: 0, rowIndex: 1 },
      rows[1],
      "2026-06-13",
      customers,
      lookupCode,
      lookupId
    );
    expect(resolved.syncStatus).toBe("sheet_duplicate");
    expect(sheetRowIsBlocked(resolved.syncStatus)).toBe(true);
  });

  it("chặn ADD khi AWB đã có phiên khác", () => {
    const other = {
      id: "old-1",
      sessionDate: "2026-06-12",
      awb: "618-5440 5131",
      warehouse: "TECS-TCS",
    };
    const globalState = { rows: [other] };
    expect(findExistingOtherSession(globalState, "2026-06-13", "61854405131")?.id).toBe("old-1");

    const resolved = resolveSheetRowSyncStatus(
      { existing: null, otherSession: other, sheetFirstIndex: 0, rowIndex: 0 },
      { awb: "618-5440 5131", warehouse: "TECS-SCSC", customer: "" },
      "2026-06-13",
      customers,
      lookupCode,
      lookupId
    );
    expect(resolved.syncStatus).toBe("awb_taken");
    expect(resolved.takenSessionDate).toBe("2026-06-12");
  });

  it("ghép lô booking trống AWB với dòng Sheet cùng chuyến/khách/DEST", () => {
    const blankBooking = {
      id: "new-blank",
      sessionDate: "2026-07-16",
      awb: "",
      warehouse: "TECS-TCS",
      customer: "CITYLINK",
      flight: "MH767",
      flightDate: "16JUL",
      dest: "KUL",
      pcs: 12,
      kg: 174,
      cutoff: "16:00",
      cutoffNote: "16JUL",
      note: "",
      consigneeNamePrint: "",
    };
    const sheetRow = {
      awb: "232-1827 6484",
      warehouse: "TECS-TCS",
      customer: "CITYLINK",
      flight: "MH767",
      flightDate: "16JUL",
      cutoff: "16:00",
      cutoffNote: "16JUL",
      dest: "KUL",
      pcs: 12,
      kg: 174,
      note: "",
      consigneeNamePrint: "CITY LINK EXPRESS SDN BHD",
    };
    const rows = [blankBooking];
    const awbIndexes = { inSession: new Map(), otherSession: new Map() };

    expect(blankBookingMatchesSheetRow(blankBooking, sheetRow, "2026-07-16")).toBe(true);
    expect(findBlankAwbBookingInSession(rows, "2026-07-16", sheetRow)?.id).toBe("new-blank");
    expect(resolveExistingForSheetRow(rows, awbIndexes, "2026-07-16", sheetRow)?.id).toBe("new-blank");

    const resolved = resolveSheetRowSyncStatus(
      { existing: blankBooking, otherSession: null, sheetFirstIndex: 0, rowIndex: 0 },
      sheetRow,
      "2026-07-16",
      customers,
      lookupCode,
      lookupId
    );
    expect(resolved.syncStatus).toBe("update");
    expect(sheetRowIsBlocked(resolved.syncStatus)).toBe(false);
  });
});
