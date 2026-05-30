import { describe, expect, it } from "vitest";
import {
  hqFieldsFromBlobRow,
  mergeShipmentHqFields,
  shipmentHqFromRow,
} from "./postgresStateStore.mjs";

describe("postgres HQ fields", () => {
  it("đọc invoice từ cột jsonb shipments", () => {
    const hq = shipmentHqFromRow({
      invoice_items: [{ lineId: "a", description: "X", hsCode: "1", origin: "VN", quantity: 1, unit: "PCE", unitPriceUsd: 1, kgPerUnit: 0.1 }],
      invoice_declarations: [{ id: "d1", label: "Tờ 1", seq: 1, items: [] }],
    });
    expect(hq.invoiceItems?.length).toBe(1);
    expect(hq.invoiceDeclarations?.length).toBe(1);
  });

  it("gộp từ blob khi relational chưa có HQ", () => {
    const relational = { id: "s1", awb: "123" };
    const blob = {
      id: "s1",
      invoiceItems: [{ lineId: "b", description: "Y", hsCode: "2", origin: "VN", quantity: 2, unit: "PCE", unitPriceUsd: 3, kgPerUnit: 0.2 }],
    };
    const merged = mergeShipmentHqFields(relational, blob);
    expect(merged.invoiceItems?.length).toBe(1);
    expect(merged.awb).toBe("123");
  });

  it("ưu tiên cột relational hơn blob", () => {
    const relational = {
      id: "s1",
      invoiceDeclarations: [{ id: "d2", label: "Tờ 1", seq: 1, items: [{ lineId: "r", description: "R", hsCode: "9", origin: "VN", quantity: 1, unit: "PCE", unitPriceUsd: 1, kgPerUnit: 1 }] }],
    };
    const blob = {
      id: "s1",
      invoiceItems: [{ lineId: "old", description: "OLD", hsCode: "0", origin: "VN", quantity: 99, unit: "PCE", unitPriceUsd: 1, kgPerUnit: 1 }],
    };
    const merged = mergeShipmentHqFields(relational, blob);
    expect(merged.invoiceDeclarations?.length).toBe(1);
    expect(merged.invoiceItems).toBeUndefined();
  });

  it("hqFieldsFromBlobRow bỏ mảng rỗng", () => {
    expect(hqFieldsFromBlobRow({ invoiceItems: [], invoiceDeclarations: [] })).toEqual({});
  });
});
