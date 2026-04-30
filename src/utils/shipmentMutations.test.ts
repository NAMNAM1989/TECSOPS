import { describe, expect, it } from "vitest";
import { applyShipmentMutation, type AppState } from "./shipmentMutations";
import type { Shipment } from "../types/shipment";

const emptyRow = (id: string): Shipment => ({
  id,
  stt: 1,
  sessionDate: "2026-04-07",
  awb: "111-1111 1111",
  flight: "",
  flightDate: "",
  cutoff: "",
  cutoffNote: "",
  note: "",
  dest: "KUL",
  warehouse: "TECS-TCS",
  pcs: null,
  kg: null,
  dimWeightKg: null,
  dimLines: null,
  dimDivisor: null,
  customer: "X",
  customerCode: "",
  status: "PENDING",
});

describe("applyShipmentMutation SET_CUSTOMERS", () => {
  it("cập nhật danh bạ và tăng version, giữ rows", () => {
    const state: AppState = {
      version: 3,
      rows: [emptyRow("a")],
      customers: [{ id: "1", code: "A", name: "Old" }],
    };
    const next = applyShipmentMutation(state, {
      action: "SET_CUSTOMERS",
      customers: [
        { id: "n1", code: "M1", name: "ACME" },
        { id: "n2", code: "M2", name: "Beta" },
      ],
    });
    expect(next.version).toBe(4);
    expect(next.rows).toHaveLength(1);
    expect(next.customers).toEqual([
      { id: "n1", code: "M1", name: "ACME" },
      { id: "n2", code: "M2", name: "Beta" },
    ]);
  });

  it("từ chối mã trùng", () => {
    const state: AppState = { version: 1, rows: [], customers: [] };
    expect(() =>
      applyShipmentMutation(state, {
        action: "SET_CUSTOMERS",
        customers: [
          { id: "a", code: "X", name: "A" },
          { id: "b", code: "x", name: "B" },
        ],
      })
    ).toThrow(/trùng/i);
  });
});
