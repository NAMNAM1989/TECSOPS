import { describe, expect, it } from "vitest";
import {
  countUniqueCatalogCategories,
  pickRandomCatalogItems,
  randomInvoiceLinesFromCatalog,
} from "./invoiceRandomPick";
import type { InvoiceCatalogItem } from "../types/invoiceItem";

const catalog: InvoiceCatalogItem[] = [
  {
    id: "a1",
    category: "BÁNH",
    description: "Bánh A",
    hsCode: "1",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 1,
    kgPerUnit: 0.5,
  },
  {
    id: "a2",
    category: "BÁNH",
    description: "Bánh B",
    hsCode: "2",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 1,
    kgPerUnit: 0.5,
  },
  {
    id: "b1",
    category: "KẸO",
    description: "Kẹo A",
    hsCode: "3",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 1,
    kgPerUnit: 0.5,
  },
  {
    id: "c1",
    category: "TRÀ",
    description: "Trà A",
    hsCode: "4",
    origin: "VN",
    sampleQuantity: 1,
    unit: "BAG",
    unitPriceUsd: 1,
    kgPerUnit: 0.5,
  },
];

describe("pickRandomCatalogItems", () => {
  it("không trùng loại hàng", () => {
    const rng = () => 0;
    const picked = pickRandomCatalogItems(catalog, 3, rng);
    const cats = picked.map((it) => it.category);
    expect(new Set(cats).size).toBe(cats.length);
    expect(picked.length).toBe(3);
  });

  it("giới hạn theo số loại có sẵn", () => {
    const picked = pickRandomCatalogItems(catalog, 10, () => 0.5);
    expect(picked.length).toBe(3);
  });

  it("randomInvoiceLinesFromCatalog gán category từ catalog", () => {
    const lines = randomInvoiceLinesFromCatalog(catalog, 2, () => 0);
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.category && l.description)).toBe(true);
    expect(new Set(lines.map((l) => l.category)).size).toBe(2);
  });
});

describe("countUniqueCatalogCategories", () => {
  it("đếm loại khác nhau", () => {
    expect(countUniqueCatalogCategories(catalog)).toBe(3);
  });
});
