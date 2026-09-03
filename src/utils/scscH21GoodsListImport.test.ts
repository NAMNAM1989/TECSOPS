import { describe, expect, it } from "vitest";
import type { ScscH21CatalogItem } from "../types/scscH21Catalog";
import {
  buildH21InvoiceLinesFromGoodsList,
  extractGoodsQueriesFromText,
  scoreH21GoodsSimilarity,
} from "./scscH21GoodsListImport";
import { createSeededRng } from "../../shared/scscH21InvoiceCore.mjs";

function item(partial: Partial<ScscH21CatalogItem> & { id: string; description: string }): ScscH21CatalogItem {
  return {
    category: "FOOD",
    hsCode: "123",
    origin: "VIETNAM",
    qty1: 1,
    uom1: "PCE",
    qty2: 0,
    uom2: "KGM",
    unitPrice: 1,
    amount: 1,
    unitFactor: 0.5,
    sortOrder: 0,
    warehouseScope: "SCSC",
    active: true,
    ...partial,
  };
}

describe("extractGoodsQueriesFromText", () => {
  it("reads one product per line and skips noise", () => {
    const q = extractGoodsQueriesFromText(
      ["STT", "1. Frozen shrimp 16/20", "Banana fresh", "100", "TOTAL"].join("\n")
    );
    expect(q).toEqual(["Frozen shrimp 16/20", "Banana fresh"]);
  });

  it("picks description column from csv-like lines", () => {
    const q = extractGoodsQueriesFromText("1,Fresh mango,10\n2,Dragon fruit,5");
    expect(q.some((x) => /mango/i.test(x))).toBe(true);
    expect(q.some((x) => /dragon/i.test(x))).toBe(true);
  });
});

describe("scoreH21GoodsSimilarity", () => {
  it("scores exact and partial matches", () => {
    expect(scoreH21GoodsSimilarity("Fresh mango", "Fresh mango")).toBe(1);
    expect(scoreH21GoodsSimilarity("mango", "Fresh mango Grade A")).toBeGreaterThan(0.8);
    expect(scoreH21GoodsSimilarity("frozen shrimp", "Frozen Shrimp 16/20 IQF")).toBeGreaterThan(
      0.4
    );
    expect(scoreH21GoodsSimilarity("abcxyz", "Fresh mango")).toBeLessThan(0.2);
  });
});

describe("buildH21InvoiceLinesFromGoodsList", () => {
  const catalog = [
    item({ id: "a", description: "Frozen Shrimp 16/20 IQF", category: "SEAFOOD", unitFactor: 0.5 }),
    item({ id: "b", description: "Fresh Mango Cat Chu", category: "FRUIT", unitFactor: 1 }),
    item({ id: "c", description: "T-Shirt Cotton", category: "GARMENT", unitFactor: 0.2 }),
  ];

  it("matches list rows to catalog and allocates kg", () => {
    const result = buildH21InvoiceLinesFromGoodsList({
      queries: ["shrimp frozen", "mango fresh", "unknown widget"],
      catalog,
      grossKg: 100,
      rng: createSeededRng(7),
    });
    expect(result.matches).toHaveLength(2);
    expect(result.unmatched).toEqual(["unknown widget"]);
    expect(result.lines.length).toBe(2);
    const totalKg = result.lines.reduce((s, l) => s + l.weightKg, 0);
    expect(totalKg).toBeGreaterThan(50);
    expect(totalKg).toBeLessThanOrEqual(100);
  });

  it("throws when nothing matches", () => {
    expect(() =>
      buildH21InvoiceLinesFromGoodsList({
        queries: ["zzzz-no-match"],
        catalog,
        grossKg: 50,
      })
    ).toThrow(/Không khớp/);
  });
});
