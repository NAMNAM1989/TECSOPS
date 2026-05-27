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

describe("applyShipmentMutation SET_PRINTER_PROFILES", () => {
  it("lưu catalog profile máy in", () => {
    const state: AppState = {
      version: 1,
      rows: [],
      customers: [],
      printerProfiles: { version: 1, profiles: [], updatedAt: "" },
    };
    const next = applyShipmentMutation(state, {
      action: "SET_PRINTER_PROFILES",
      catalog: {
        version: 1,
        updatedAt: "2026-05-15T00:00:00.000Z",
        profiles: [
          {
            id: "thermal-1",
            name: "Quầy 1",
            type: "thermal-tspl",
            connection: "tcp",
            host: "10.0.0.5",
            port: 9100,
            dpi: 203,
            labelWidthMm: 100,
            labelHeightMm: 80,
            pageWidthMm: 80,
            pageHeightMm: 100,
            gapMm: 2,
            rotation: 90,
            offsetXmm: 0,
            offsetYmm: 0,
            speed: 4,
            density: 8,
            copiesDefault: 1,
            labelSheetFormat: "100x80",
          },
        ],
      },
    });
    expect(next.version).toBe(2);
    expect(next.printerProfiles?.profiles).toHaveLength(1);
    expect(next.printerProfiles?.profiles[0]?.name).toBe("Quầy 1");
  });
});

describe("applyShipmentMutation SET_INVOICE_CATALOG", () => {
  it("lưu danh mục mặt hàng HQ", () => {
    const state: AppState = { version: 1, rows: [], customers: [] };
    const next = applyShipmentMutation(state, {
      action: "SET_INVOICE_CATALOG",
      catalog: {
        version: 1,
        items: [
          {
            id: "inv-test",
            category: "BÁNH",
            description: "Test item",
            hsCode: "19059090",
            origin: "VN",
            sampleQuantity: 1,
            unit: "BAG",
            unitPriceUsd: 1,
            kgPerUnit: 0.5,
          },
        ],
      },
    });
    expect(next.version).toBe(2);
    expect(next.invoiceCatalog?.items).toHaveLength(1);
    expect(next.invoiceCatalog?.items[0]?.description).toBe("Test item");
  });
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
    ).toThrow(/đã tồn tại/i);
  });
});
