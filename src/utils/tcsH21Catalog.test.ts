import { describe, expect, it } from "vitest";
import {
  clampTcsH21Catalog,
  clampTcsH21InvoiceLines,
  normalizeTcsH21CatalogItem,
} from "../../shared/tcsH21CatalogNormalize.mjs";
import { isTcsH21Warehouse } from "../types/tcsH21Catalog";
import { clampInvoiceItemsForShipment } from "./tcsH21Api";

describe("tcsH21Catalog", () => {
  it("normalize gắn warehouseScope TCS", () => {
    const item = normalizeTcsH21CatalogItem({
      description: "Frozen shrimp",
      category: "FROZEN",
      qty1: 10,
      unitPrice: 1.5,
    });
    expect(item?.warehouseScope).toBe("TCS");
    expect(item?.description).toBe("Frozen shrimp");
  });

  it("clamp catalog bỏ item thiếu mô tả", () => {
    const list = clampTcsH21Catalog([
      { description: "OK", qty1: 1 },
      { description: "", qty1: 1 },
    ]);
    expect(list).toHaveLength(1);
  });

  it("clamp invoice lines", () => {
    expect(clampTcsH21InvoiceLines([{ description: "" }])).toHaveLength(0);
    expect(
      clampTcsH21InvoiceLines([{ description: "OK", quantity: 1, unitPrice: 2 }])
    ).toHaveLength(1);
  });

  it("isTcsH21Warehouse chỉ TCS exact", () => {
    expect(isTcsH21Warehouse("TCS")).toBe(true);
    expect(isTcsH21Warehouse("TECS-TCS")).toBe(false);
    expect(isTcsH21Warehouse("SCSC")).toBe(false);
  });

  it("clampInvoiceItemsForShipment chỉ TCS", () => {
    expect(clampInvoiceItemsForShipment("SCSC", [{ description: "X", quantity: 1 }])).toBeUndefined();
    expect(clampInvoiceItemsForShipment("TCS", [{ description: "X", quantity: 1 }])?.length).toBe(1);
  });
});
