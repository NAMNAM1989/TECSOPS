import { describe, expect, it } from "vitest";
import {
  clampScscH21Catalog,
  clampScscH21InvoiceLines,
  catalogItemFromExcelRow,
  findDuplicateScscH21Descriptions,
  findScscH21DescriptionConflict,
  invoiceLineFromCatalogItem,
  normalizeScscH21CatalogItem,
  parsePackWeightKgFromDescription,
} from "../../shared/scscH21CatalogNormalize.mjs";
import { isScscH21Warehouse } from "../types/scscH21Catalog";
import { clampInvoiceItemsForShipment } from "./scscH21Api";

describe("scscH21CatalogNormalize", () => {
  it("normalize item + scope SCSC", () => {
    const item = normalizeScscH21CatalogItem({
      category: "cà phê",
      description: "Cà phê hòa tan 247",
      hsCode: "21011119",
      qty1: 65,
      uom1: "BAG",
      unitPrice: 0.4,
    });
    expect(item).toMatchObject({
      category: "CÀ PHÊ",
      warehouseScope: "SCSC",
      hsCode: "21011119",
      amount: 26,
      uom1: "BAG",
    });
  });

  it("map UOM lạ UNK → BAG", () => {
    const item = normalizeScscH21CatalogItem({
      description: "Bánh test",
      uom1: "UNK",
    });
    expect(item?.uom1).toBe("BAG");
  });

  it("parse excel row tiếng Việt", () => {
    const item = catalogItemFromExcelRow({
      "LOẠI HÀNG": "ÁO",
      "Tên hàng": "Áo thun nam",
      "Mã HS": 61099020,
      "LƯỢNG 1": 50,
      "DVT 1": "PCE",
      "ĐƠN GIÁ": 0.4,
    });
    expect(item?.hsCode).toBe("61099020");
    expect(item?.category).toBe("ÁO");
  });

  it("dedupe clamp by id", () => {
    const list = clampScscH21Catalog([
      { id: "a", description: "One" },
      { id: "a", description: "One again" },
      { id: "b", description: "Two" },
    ]);
    expect(list).toHaveLength(2);
  });

  it("invoice line from catalog", () => {
    const line = invoiceLineFromCatalogItem({
      id: "cat-1",
      description: "Mì Hảo Hảo",
      hsCode: "19023040",
      qty1: 35,
      uom1: "BAG",
      qty2: 2.975,
      uom2: "KGM",
      unitPrice: 0.45,
      unitFactor: 0.085,
    });
    expect(line?.catalogItemId).toBe("cat-1");
    expect(line?.weightKg).toBe(2.975);
    expect(line?.amount).toBe(15.75);
  });

  it("ưu tiên (250g/bag) trong mô tả — không lấy qty2 lệch", () => {
    const item = normalizeScscH21CatalogItem({
      id: "anan",
      description: "Bánh gạo An An, hàng mới 100% (250g/bag)",
      qty1: 150,
      uom1: "BAG",
      qty2: 16.65,
      uom2: "KGM",
      unitPrice: 0.7,
      unitFactor: 0.25,
    });
    expect(item?.unitFactor).toBe(0.25);
    expect(item?.qty2).toBe(37.5);
    const line = invoiceLineFromCatalogItem(item);
    expect(line?.quantity).toBe(150);
    expect(line?.weightKg).toBe(37.5);
    expect(line?.amount).toBe(105);
  });

  it("parsePackWeightKgFromDescription", () => {
    expect(parsePackWeightKgFromDescription("X (250g/bag)")).toBe(0.25);
    expect(parsePackWeightKgFromDescription("Y (1kg/túi)")).toBe(1);
    expect(parsePackWeightKgFromDescription("Z no pack")).toBeNull();
  });

  it("invoice lines clamp", () => {
    expect(clampScscH21InvoiceLines([{ description: "" }])).toHaveLength(0);
    expect(
      clampScscH21InvoiceLines([{ description: "OK", quantity: 1, unitPrice: 2 }])
    ).toHaveLength(1);
  });

  it("phát hiện mô tả trùng (không phân biệt hoa thường / khoảng trắng)", () => {
    const dups = findDuplicateScscH21Descriptions([
      { id: "1", description: "Bánh mì Staff" },
      { id: "2", description: "  bánh   mì  staff " },
      { id: "3", description: "Khác" },
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].ids).toEqual(["1", "2"]);
    expect(
      findScscH21DescriptionConflict(
        [
          { id: "1", description: "Cà phê 247" },
          { id: "2", description: "Mì Hảo Hảo" },
        ],
        "cà  phê 247",
        { exceptId: "x" }
      )?.id
    ).toBe("1");
    expect(
      findScscH21DescriptionConflict(
        [{ id: "1", description: "Cà phê 247" }],
        "Cà phê 247",
        { exceptId: "1" }
      )
    ).toBeNull();
  });
});

describe("scsc H21 warehouse gate", () => {
  it("chỉ SCSC", () => {
    expect(isScscH21Warehouse("SCSC")).toBe(true);
    expect(isScscH21Warehouse("TECS-SCSC")).toBe(false);
    expect(isScscH21Warehouse("TCS")).toBe(false);
  });

  it("clampInvoiceItemsForShipment chỉ SCSC", () => {
    expect(clampInvoiceItemsForShipment("TCS", [{ description: "X", quantity: 1 }])).toBeUndefined();
    expect(clampInvoiceItemsForShipment("SCSC", [{ description: "X", quantity: 1 }])?.length).toBe(1);
  });
});
