import { describe, expect, it } from "vitest";
import {
  clampTcsH21Catalog,
  clampTcsH21InvoiceDeclarations,
  clampTcsH21InvoiceLines,
  normalizeTcsH21CatalogItem,
  resolveH21UnitFactorKg,
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
    expect(item?.amount).toBe(15);
  });

  it("clamp catalog bỏ item thiếu mô tả", () => {
    const list = clampTcsH21Catalog([
      { description: "OK", qty1: 1 },
      { description: "", qty1: 1 },
    ]);
    expect(list).toHaveLength(1);
  });

  it("clamp invoice lines đồng bộ amount = qty × đơn giá", () => {
    expect(clampTcsH21InvoiceLines([{ description: "" }])).toHaveLength(0);
    const lines = clampTcsH21InvoiceLines([
      { description: "OK", quantity: 1, unitPrice: 2, amount: 999 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(2);
  });

  it("giữ declarationPcs khi clamp decls (parity SCSC)", () => {
    const decls = clampTcsH21InvoiceDeclarations([
      {
        id: "d1",
        seq: 1,
        declarationKg: 100,
        declarationPcs: 40,
        cargoFamilyMode: "auto",
        lines: [{ description: "Áo", quantity: 10, unitPrice: 1, weightKg: 5 }],
      },
    ]);
    expect(decls).toHaveLength(1);
    expect(decls[0].declarationPcs).toBe(40);
    expect(decls[0].declarationKg).toBe(100);
  });

  it("resolveH21UnitFactorKg allowQtyRatio:false bỏ L2÷L1", () => {
    expect(
      resolveH21UnitFactorKg(
        { description: "no pack", unitFactor: 0, qty1: 50, qty2: 25 },
        { allowQtyRatio: false }
      )
    ).toBe(0);
    expect(
      resolveH21UnitFactorKg({
        description: "no pack",
        unitFactor: 0,
        qty1: 50,
        qty2: 25,
      })
    ).toBe(0.5);
  });

  it("isTcsH21Warehouse chỉ TCS exact", () => {
    expect(isTcsH21Warehouse("TCS")).toBe(true);
    expect(isTcsH21Warehouse("TECS-TCS")).toBe(false);
    expect(isTcsH21Warehouse("SCSC")).toBe(false);
  });

  it("clampInvoiceItemsForShipment chỉ TCS", () => {
    expect(
      clampInvoiceItemsForShipment("SCSC", [{ description: "X", quantity: 1 }])
    ).toBeUndefined();
    expect(
      clampInvoiceItemsForShipment("TCS", [
        { description: "X", quantity: 1, unitPrice: 2 },
      ])
    ).toHaveLength(1);
  });
});
