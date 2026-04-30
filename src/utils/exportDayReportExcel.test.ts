import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  buildDayReportWorkbook,
  defaultDayReportFileName,
  prepareDayReportRows,
} from "./exportDayReportExcel";

function base(id: string, warehouse: Shipment["warehouse"], stt: number, sessionDate: string, awb: string): Shipment {
  return {
    id,
    stt,
    sessionDate,
    awb,
    dest: "KUL",
    flight: "",
    flightDate: "",
    cutoff: "",
    cutoffNote: "",
    note: "",
    warehouse,
    pcs: 1,
    kg: 1,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "C",
    customerCode: "",
    status: "PENDING",
  };
}

describe("prepareDayReportRows", () => {
  const ymd = "2026-04-07";

  it("lọc đúng ngày và gồm cả TCS lẫn SCSC", () => {
    const rows: Shipment[] = [
      base("sc-1", "TECS-SCSC", 1, ymd, "111-1111 1111"),
      base("tc-1", "TECS-TCS", 1, ymd, "222-2222 2222"),
      base("other-day", "TECS-TCS", 1, "2026-04-06", "333-3333 3333"),
    ];
    const out = prepareDayReportRows(rows, ymd);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id)).toEqual(["sc-1", "tc-1"]);
  });

  it("giữ thứ tự mảng gốc (không sắp theo kho hay STT)", () => {
    const rows: Shipment[] = [
      base("sc-2", "TECS-SCSC", 2, ymd, "SC-2"),
      base("tc-1", "TECS-TCS", 1, ymd, "TC-1"),
      base("sc-1", "TECS-SCSC", 1, ymd, "SC-1"),
      base("tc-2", "TECS-TCS", 2, ymd, "TC-2"),
    ];
    const out = prepareDayReportRows(rows, ymd);
    expect(out.map((r) => r.awb)).toEqual(["SC-2", "TC-1", "SC-1", "TC-2"]);
  });

  it("chuẩn hoá trim sessionDate / ymd", () => {
    const rows: Shipment[] = [base("tc", "TECS-TCS", 1, `  ${ymd}  `, "444-4444 4444")];
    expect(prepareDayReportRows(rows, ` ${ymd} `)).toHaveLength(1);
  });

  it("Excel: cột STT là 1…n liên tục (không lặp STT theo kho)", async () => {
    const rows: Shipment[] = [
      base("sc", "TECS-SCSC", 11, ymd, "111-1111 1111"),
      base("tc", "TECS-TCS", 1, ymd, "222-2222 2222"),
    ];
    const wb = await buildDayReportWorkbook(rows, ymd);
    const sh = wb.worksheets[0];
    expect(sh.getRow(2).getCell(1).value).toBe(1);
    expect(sh.getRow(3).getCell(1).value).toBe(2);
  });

  it("Excel: có cột Mã Khách Hàng và tra mã theo danh bạ", async () => {
    const rows: Shipment[] = [
      { ...base("a", "TECS-TCS", 1, ymd, "111-1111 1111"), customer: "ACME", customerCode: "" },
    ];
    const wb = await buildDayReportWorkbook(rows, ymd, [{ id: "1", code: "M1", name: "ACME" }]);
    const sh = wb.worksheets[0];
    expect(sh.getRow(1).getCell(9).value).toBe("Mã Khách Hàng");
    expect(sh.getRow(2).getCell(9).value).toBe("M1");
  });

  it("Excel: ưu tiên mã khách hàng trong danh bạ hơn mã cũ đã lưu ở lô", async () => {
    const rows: Shipment[] = [
      { ...base("a", "TECS-TCS", 1, ymd, "111-1111 1111"), customer: "ACME", customerCode: "OLD" },
    ];
    const wb = await buildDayReportWorkbook(rows, ymd, [{ id: "1", code: "NEW", name: "ACME" }]);
    const sh = wb.worksheets[0];
    expect(sh.getRow(2).getCell(9).value).toBe("NEW");
  });

  it("Excel: bám định dạng mẫu 9 cột và không xuất cột Note", async () => {
    const wb = await buildDayReportWorkbook([base("a", "TECS-TCS", 1, ymd, "111-1111 1111")], ymd);
    const sh = wb.worksheets[0];
    expect(sh.getRow(1).cellCount).toBe(9);
    expect(sh.getRow(1).values).toEqual([
      undefined,
      "STT",
      "Ngày hàng vào",
      "AWB",
      "DEST",
      "Số kiện",
      "Số KG",
      "VOLUME WEIGHT",
      "Tên khách hàng",
      "Mã Khách Hàng",
    ]);
  });

  it("tên file download theo OPS_bao_cao_yyyymmdd_hhmmss", () => {
    const name = defaultDayReportFileName(ymd, new Date(2026, 3, 30, 14, 17, 5));
    expect(name).toBe("OPS_bao_cao_20260407_141705.xlsx");
  });
});
