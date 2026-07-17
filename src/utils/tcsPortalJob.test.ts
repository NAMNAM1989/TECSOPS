import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import {
  buildTcsPortalJob,
  shipmentsEligibleForTcsPortal,
  shipmentsToMarkReceptionCompleted,
} from "./tcsPortalJob";

function row(partial: Partial<Shipment> & Pick<Shipment, "id" | "awb" | "warehouse" | "sessionDate">): Shipment {
  return {
    stt: 1,
    flight: "VN123",
    flightDate: "05APR",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SGN",
    pcs: 2,
    kg: 10,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "ACME",
    customerCode: "ACME",
    status: "RECEIVED",
    ...partial,
  };
}

describe("tcsPortalJob", () => {
  it("chỉ lấy TECS-TCS đủ AWB trong phiên", () => {
    const ymd = "2026-07-17";
    const rows = [
      row({ id: "1", awb: "123-1234 5678", warehouse: "TECS-TCS", sessionDate: ymd }),
      row({ id: "2", awb: "123-1234 5679", warehouse: "TECS-SCSC", sessionDate: ymd }),
      row({ id: "3", awb: "123", warehouse: "TECS-TCS", sessionDate: ymd }),
      row({ id: "4", awb: "123-1234 5680", warehouse: "TECS-TCS", sessionDate: "2026-07-16" }),
    ];
    const eligible = shipmentsEligibleForTcsPortal(rows, ymd);
    expect(eligible.map((s) => s.id)).toEqual(["1"]);
  });

  it("mặc định gửi mọi TECS-TCS đủ AWB; onlyCompleted mới lọc Ops COMPLETED / WEIGH_SLIP", () => {
    const ymd = "2026-07-17";
    const rows = [
      row({ id: "1", awb: "12312345678", warehouse: "TECS-TCS", sessionDate: ymd, status: "COMPLETED" }),
      row({ id: "2", awb: "12312345679", warehouse: "TECS-TCS", sessionDate: ymd, status: "WEIGH_SLIP" }),
      row({ id: "3", awb: "12312345670", warehouse: "TECS-TCS", sessionDate: ymd, status: "RECEIVED" }),
    ];
    expect(shipmentsEligibleForTcsPortal(rows, ymd).map((s) => s.id)).toEqual(["1", "2", "3"]);
    expect(shipmentsEligibleForTcsPortal(rows, ymd, { onlyCompleted: true }).map((s) => s.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("build job DOWNLOAD kèm ops_status", () => {
    const ymd = "2026-07-17";
    const payload = buildTcsPortalJob(
      [row({ id: "1", awb: "12312345678", warehouse: "TECS-TCS", sessionDate: ymd, status: "COMPLETED" })],
      { sessionYmd: ymd, action: "DOWNLOAD", dryRun: true, mock: true, onlyCompleted: true }
    );
    expect(payload.warehouse).toBe("TECS-TCS");
    expect(payload.session_date).toBe(ymd);
    expect(payload.sessionDate).toBe(ymd);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].action).toBe("DOWNLOAD");
    expect(payload.rows[0].ops_status).toBe("COMPLETED");
    expect(payload.mock).toBe(true);
  });

  it("awbDigitsFilter chỉ giữ AWB ready sau quét ESID", () => {
    const ymd = "2026-07-17";
    const rows = [
      row({ id: "1", awb: "12312345678", warehouse: "TECS-TCS", sessionDate: ymd }),
      row({ id: "2", awb: "12312345679", warehouse: "TECS-TCS", sessionDate: ymd }),
    ];
    const payload = buildTcsPortalJob(rows, {
      sessionYmd: ymd,
      action: "DOWNLOAD",
      awbDigitsFilter: ["12312345679"],
    });
    expect(payload.rows.map((r) => r.shipment_id)).toEqual(["2"]);
  });

  it("shipmentsToMarkReceptionCompleted gán status sau OLA, bỏ qua COMPLETED", () => {
    const ymd = "2026-07-17";
    const rows = [
      row({ id: "1", awb: "12312345678", warehouse: "TECS-TCS", sessionDate: ymd, status: "OLA_PULL" }),
      row({
        id: "2",
        awb: "12312345679",
        warehouse: "TECS-TCS",
        sessionDate: ymd,
        status: "COMPLETED",
      }),
      row({ id: "3", awb: "12312345670", warehouse: "TECS-TCS", sessionDate: ymd, status: "RECEIVED" }),
    ];
    const mark = shipmentsToMarkReceptionCompleted(rows, ymd, ["12312345678", "12312345679"]);
    expect(mark.map((s) => s.id)).toEqual(["1"]);
  });
});
