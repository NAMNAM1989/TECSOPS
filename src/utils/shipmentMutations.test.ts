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

describe("applyShipmentMutation SET_ESID profiles", () => {
  it("SET_ESID_REGISTRANT_STORE + SET_ESID_AGENT_STORE", () => {
    const state: AppState = {
      version: 1,
      rows: [],
      customers: [],
    };
    const withReg = applyShipmentMutation(state, {
      action: "SET_ESID_REGISTRANT_STORE",
      store: {
        version: 1,
        activeId: "reg-a",
        profiles: [
          {
            id: "reg-a",
            name: "Nguyen Van A",
            tel: "0901234567",
            cccd: "001234567890",
            updatedAt: "2026-07-21T00:00:00.000Z",
          },
        ],
      },
    });
    expect(withReg.esidRegistrantStore?.profiles[0]?.name).toBe("Nguyen Van A");
    const withAgt = applyShipmentMutation(withReg, {
      action: "SET_ESID_AGENT_STORE",
      store: {
        version: 1,
        activeId: "agt-a",
        profiles: [
          {
            id: "agt-a",
            name: "TECS AGENT",
            address: "HN",
            tel: "024123",
            email: "a@b.c",
            vat: "010",
            fax: "",
            updatedAt: "2026-07-21T00:00:00.000Z",
          },
        ],
      },
    });
    expect(withAgt.esidAgentStore?.profiles[0]?.name).toBe("TECS AGENT");
    expect(withAgt.esidRegistrantStore?.profiles[0]?.name).toBe("Nguyen Van A");
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

describe("applyShipmentMutation RESET_TRIAL_DATA", () => {
  it("xóa rows và customers, giữ version tăng", () => {
    const state: AppState = {
      version: 5,
      rows: [emptyRow("a")],
      customers: [cust("1", "A", "Acme")],
    };
    const next = applyShipmentMutation(state, { action: "RESET_TRIAL_DATA" });
    expect(next.version).toBe(6);
    expect(next.rows).toEqual([]);
    expect(next.customers).toEqual([]);
  });
});
