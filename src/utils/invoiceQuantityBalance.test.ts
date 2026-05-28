import { describe, expect, it } from "vitest";
import { emptyInvoiceLineItem, totalsForInvoice } from "../types/invoiceItem";
import {
  balanceDeclarationLineItems,
  balanceLineQuantitiesToDeclaration,
  enrichLineItemsKgFromCatalog,
  grossNetWeightBadge,
  isGrossWeightBelowTarget,
} from "./invoiceQuantityBalance";

describe("invoiceQuantityBalance", () => {
  const rng = () => 0.5;

  it("tổng KG hàng luôn nhỏ hơn kg tờ", () => {
    const items = [
      emptyInvoiceLineItem({ description: "A", kgPerUnit: 2.5, quantity: 1 }),
      emptyInvoiceLineItem({ description: "B", kgPerUnit: 1.2, quantity: 1 }),
      emptyInvoiceLineItem({ description: "C", kgPerUnit: 0.8, quantity: 1 }),
    ];
    const out = balanceLineQuantitiesToDeclaration(items, { targetKg: 100, rng });
    const t = totalsForInvoice(out);
    expect(t.totalGrossKg).toBeLessThan(100);
    expect(t.totalGrossKg).toBeGreaterThan(80);
    expect(out.every((l) => l.quantity >= 1)).toBe(true);
  });

  it("cố gắng khớp targetPcs khi còn room kg", () => {
    const items = [
      emptyInvoiceLineItem({ kgPerUnit: 0.5, quantity: 1 }),
      emptyInvoiceLineItem({ kgPerUnit: 0.5, quantity: 1 }),
    ];
    const out = balanceLineQuantitiesToDeclaration(items, {
      targetKg: 100,
      targetPcs: 40,
      rng: () => 0.3,
    });
    expect(totalsForInvoice(out).totalGrossKg).toBeLessThan(100);
  });

  it("grossNetWeightBadge — OK khi hàng < tờ", () => {
    expect(grossNetWeightBadge(100, 92).ok).toBe(true);
    expect(grossNetWeightBadge(100, 100).ok).toBe(false);
    expect(isGrossWeightBelowTarget(100, 99)).toBe(true);
    expect(isGrossWeightBelowTarget(100, 100)).toBe(false);
  });

  it("enrichLineItemsKgFromCatalog lấy kg từ danh mục", () => {
    const items = [emptyInvoiceLineItem({ description: "BÁNH A", kgPerUnit: 0, quantity: 5 })];
    const catalog = [
      {
        id: "c1",
        category: "BÁNH",
        description: "BÁNH A",
        hsCode: "1",
        origin: "VN",
        sampleQuantity: 1,
        unit: "BAG",
        unitPriceUsd: 1,
        kgPerUnit: 2.5,
      },
    ];
    const enriched = enrichLineItemsKgFromCatalog(items, catalog);
    expect(enriched[0]?.kgPerUnit).toBe(2.5);
    const result = balanceDeclarationLineItems(enriched, catalog, { targetKg: 100, rng });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(totalsForInvoice(result.items).totalGrossKg).toBeLessThan(100);
    }
  });
});
