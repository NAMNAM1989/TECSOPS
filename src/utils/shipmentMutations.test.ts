import { describe, expect, it } from "vitest";
import { applyShipmentMutation, type AppState } from "./shipmentMutations";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";

function cust(
  id: string,
  code: string,
  name: string,
  extra: Partial<Omit<CustomerDirectoryEntry, "id" | "code" | "name">> = {}
): CustomerDirectoryEntry {
  return {
    id,
    code,
    name,
    parties: [],
    ...extra,
  };
}

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
      customers: [cust("1", "A", "Old")],
    };
    const next = applyShipmentMutation(state, {
      action: "SET_CUSTOMERS",
      customers: [
        cust("n1", "M1", "ACME"),
        cust("n2", "M2", "Beta", {
          parties: [{ id: "s1", type: "SHIPPER", label: "HCM", content: "Line1\nLine2" }],
        }),
      ],
    });
    expect(next.version).toBe(4);
    expect(next.rows).toHaveLength(1);
    expect(next.customers).toEqual([
      cust("n1", "M1", "ACME"),
      cust("n2", "M2", "Beta", {
        parties: [{ id: "s1", type: "SHIPPER", label: "HCM", content: "Line1\nLine2" }],
      }),
    ]);
  });

  it("từ chối mã trùng", () => {
    const state: AppState = { version: 1, rows: [], customers: [] };
    expect(() =>
      applyShipmentMutation(state, {
        action: "SET_CUSTOMERS",
        customers: [cust("a", "X", "A"), cust("b", "x", "B")],
      })
    ).toThrow(/trùng/i);
  });
});
