import { describe, expect, it } from "vitest";
import {
  detectH21CargoFamily,
  filterCatalogByH21Family,
  pickCatalogItemsGrouped,
} from "../../shared/scscH21InvoiceGroups.mjs";
import { createSeededRng, generateRandomH21InvoiceLines } from "../../shared/scscH21InvoiceCore.mjs";

const frozenItem = (id: string, cat = "ĐÔNG LẠNH") => ({
  id,
  description: `Frozen ${id}`,
  category: cat,
  hsCode: "123",
  origin: "VIETNAM",
  qty1: 1,
  uom1: "BAG",
  qty2: 0,
  uom2: "KGM",
  unitPrice: 1,
  amount: 1,
  unitFactor: 1,
  sortOrder: 0,
  warehouseScope: "SCSC",
  active: true,
});

const garmentItem = (id: string) => ({
  ...frozenItem(id, "ÁO"),
  description: `Shirt ${id}`,
});

describe("scscH21InvoiceGroups", () => {
  it("detectH21CargoFamily từ tên hàng", () => {
    expect(detectH21CargoFamily("Sầu riêng đông lạnh IQF")).toBe("frozen");
    expect(detectH21CargoFamily("QUẦN ÁO / GARMENTS")).toBe("garment");
    expect(detectH21CargoFamily("Bánh pía thực phẩm")).toBe("food");
    expect(detectH21CargoFamily("")).toBe("general");
  });

  it("pickCatalogItemsGrouped xoay vòng theo category", () => {
    const catalog = [
      frozenItem("f1"),
      frozenItem("f2"),
      frozenItem("f3", "TRÁI CÂY ĐL"),
      garmentItem("g1"),
    ];
    const rng = createSeededRng(7);
    const picked = pickCatalogItemsGrouped(
      filterCatalogByH21Family(catalog, "frozen"),
      3,
      rng
    );
    expect(picked).toHaveLength(3);
    const cats = picked.map((p) => (p as { category: string }).category);
    expect(cats.filter((c) => c === "ĐÔNG LẠNH").length).toBeGreaterThan(0);
    expect(cats.filter((c) => c === "TRÁI CÂY ĐL").length).toBeGreaterThan(0);
  });

  it("generateRandom chỉ lấy nhóm đông lạnh", () => {
    const catalog = [
      frozenItem("f1"),
      frozenItem("f2"),
      frozenItem("f3"),
      garmentItem("g1"),
      garmentItem("g2"),
    ];
    const rng = createSeededRng(99);
    const lines = generateRandomH21InvoiceLines({
      catalog,
      lineCount: 3,
      grossKg: 500,
      rng,
      cargoFamily: "frozen",
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.description).toMatch(/Frozen/i);
    }
  });
});
