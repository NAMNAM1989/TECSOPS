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
    savedShippers: [],
    savedConsignees: [],
    savedGoods: [],
    savedVehicles: [],
    savedDimTemplates: [],
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
  customerId: "",
  globalAgentId: "",
  customerGoodsId: "",
  customerShipperId: "",
  customerConsigneeId: "",
  status: "PENDING",
});

describe("applyShipmentMutation SET_AIRLINE_LABEL_OVERRIDES", () => {
  it("lưu ghi đè tên hãng và giữ rows/customers", () => {
    const state: AppState = {
      version: 2,
      rows: [emptyRow("a")],
      customers: [cust("1", "A", "ACME")],
      airlineLabelOverrides: { byAwbPrefix: {}, byFlightPrefix: {} },
    };
    const next = applyShipmentMutation(state, {
      action: "SET_AIRLINE_LABEL_OVERRIDES",
      overrides: {
        byAwbPrefix: { "978": "VIETJET AIR — CUSTOM" },
        byFlightPrefix: { VJ: "TEST AIR" },
      },
    });
    expect(next.version).toBe(3);
    expect(next.rows).toHaveLength(1);
    expect(next.customers).toHaveLength(1);
    expect(next.airlineLabelOverrides?.byAwbPrefix["978"]).toBe("VIETJET AIR — CUSTOM");
    expect(next.airlineLabelOverrides?.byFlightPrefix.VJ).toBe("TEST AIR");
  });
});

describe("applyShipmentMutation SET_CUSTOMERS", () => {
  it("cập nhật danh bạ và tăng version, giữ rows", () => {
    const state: AppState = {
      version: 3,
      rows: [emptyRow("a")],
      customers: [cust("1", "OLD", "Old")],
    };
    const next = applyShipmentMutation(state, {
      action: "SET_CUSTOMERS",
      customers: [
        cust("n1", "ACM", "ACME"),
        cust("n2", "BET", "Beta", {
          parties: [{ id: "s1", type: "SHIPPER", label: "HCM", content: "Line1\nLine2" }],
        }),
      ],
    });
    expect(next.version).toBe(4);
    expect(next.rows).toHaveLength(1);
    expect(next.customers).toEqual([
      cust("n1", "ACM", "ACME"),
      cust("n2", "BET", "Beta", {
        parties: [{ id: "s1", type: "SHIPPER", label: "HCM", content: "Line1\nLine2" }],
      }),
    ]);
  });

  it("từ chối mã trùng", () => {
    const state: AppState = { version: 1, rows: [], customers: [] };
    expect(() =>
      applyShipmentMutation(state, {
        action: "SET_CUSTOMERS",
        customers: [cust("a", "ABC", "A"), cust("b", "abc", "B")],
      })
    ).toThrow(/đã tồn tại/i);
  });
});

describe("applyShipmentMutation ADD status", () => {
  it("derive RECEIVED khi có AWB + pcs (không kẹt PENDING cứng)", () => {
    const state: AppState = { version: 1, rows: [], customers: [] };
    const next = applyShipmentMutation(state, {
      action: "ADD",
      shipment: {
        ...emptyRow("x"),
        awb: "978-23804012",
        pcs: 5,
        kg: 20,
        status: "PENDING",
      },
    });
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]?.status).toBe("RECEIVED");
  });
});
