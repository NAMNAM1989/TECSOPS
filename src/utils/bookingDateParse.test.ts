import { describe, expect, it } from "vitest";
import {
  buildCutoffIsoFromDateAndTimeText,
  cutoffIsoToDateDdMon,
  cutoffIsoToTimeInputText,
  formatCutoffDisplayFromLocalParts,
  formatYmdToFlightDateDdMon,
  parseBookingDateLoose,
  parseCutoffTimeCompact,
  parseFlightDateDisplayToYmd,
  ymdToDdMon,
} from "./bookingDateParse";

describe("parseFlightDateDisplayToYmd", () => {
  it("15APR năm 2026", () => {
    expect(parseFlightDateDisplayToYmd("15APR", 2026)).toBe("2026-04-15");
  });
  it("một chữ số ngày 5APR", () => {
    expect(parseFlightDateDisplayToYmd("5APR", 2026)).toBe("2026-04-05");
  });
  it("ngày không tồn tại", () => {
    expect(parseFlightDateDisplayToYmd("31FEB", 2026)).toBe("");
  });
});

describe("parseBookingDateLoose", () => {
  const y = 2026;

  it("ISO YYYY-MM-DD", () => {
    expect(parseBookingDateLoose("2026-04-15", y)).toBe("2026-04-15");
  });

  it("DD/MM/YYYY", () => {
    expect(parseBookingDateLoose("15/04/2026", y)).toBe("2026-04-15");
  });

  it("15APR (năm mặc định phiên)", () => {
    expect(parseBookingDateLoose("15APR", y)).toBe("2026-04-15");
  });

  it("15APR2026", () => {
    expect(parseBookingDateLoose("15APR2026", y)).toBe("2026-04-15");
  });

  it("chuỗi rỗng", () => {
    expect(parseBookingDateLoose("", y)).toBe("");
  });

  it("không hợp lệ", () => {
    expect(parseBookingDateLoose("XYZ", y)).toBe("");
  });
});

describe("parseCutoffTimeCompact", () => {
  it("17 → 17:00", () => {
    expect(parseCutoffTimeCompact("17")).toEqual({ hour: "17", minute: "00" });
  });

  it("17H", () => {
    expect(parseCutoffTimeCompact("17H")).toEqual({ hour: "17", minute: "00" });
  });

  it("17:30", () => {
    expect(parseCutoffTimeCompact("17:30")).toEqual({ hour: "17", minute: "30" });
  });

  it("1730", () => {
    expect(parseCutoffTimeCompact("1730")).toEqual({ hour: "17", minute: "30" });
  });

  it("17H30", () => {
    expect(parseCutoffTimeCompact("17H30")).toEqual({ hour: "17", minute: "30" });
  });

  it("rỗng", () => {
    expect(parseCutoffTimeCompact("")).toBeNull();
  });

  it("99:00 không hợp lệ", () => {
    expect(parseCutoffTimeCompact("99:00")).toBeNull();
  });
});

describe("ymdToDdMon / formatYmdToFlightDateDdMon", () => {
  it("round-trip display", () => {
    expect(ymdToDdMon("2026-04-06")).toBe("06APR");
    expect(formatYmdToFlightDateDdMon("2026-04-06")).toBe("06APR");
  });
});

describe("formatCutoffDisplayFromLocalParts", () => {
  it("17H - 15APR khi phút 0", () => {
    expect(formatCutoffDisplayFromLocalParts("2026-04-15", "17", "00")).toBe("17H - 15APR");
  });
  it("9H05 - 15APR khi có phút", () => {
    expect(formatCutoffDisplayFromLocalParts("2026-04-15", "09", "05")).toBe("9H05 - 15APR");
  });
});

describe("buildCutoffIsoFromDateAndTimeText / cutoffIso helpers", () => {
  it("15APR + 17H round-trip local", () => {
    const iso = buildCutoffIsoFromDateAndTimeText("15APR", "17H", 2026);
    expect(iso).toBeTruthy();
    expect(cutoffIsoToDateDdMon(iso)).toBe("15APR");
    expect(cutoffIsoToTimeInputText(iso)).toBe("17H");
  });
  it("17H30 + 06APR", () => {
    const iso = buildCutoffIsoFromDateAndTimeText("06APR2026", "17H30", 2026);
    expect(iso).toBeTruthy();
    expect(cutoffIsoToTimeInputText(iso)).toBe("17H30");
    expect(cutoffIsoToDateDdMon(iso)).toBe("06APR");
  });
});
