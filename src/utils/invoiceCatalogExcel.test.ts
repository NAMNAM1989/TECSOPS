import { describe, expect, it } from "vitest";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import {
  catalogItemDedupeKey,
  findDuplicateCatalogDescriptions,
  mergeImportedCatalogItems,
  parseInvoiceCatalogWorksheet,
  validateCatalogItemsForSave,
} from "./invoiceCatalogExcel";

const base = (description: string, partial?: Partial<InvoiceCatalogItem>): InvoiceCatalogItem => ({
  id: `id-${description.slice(0, 4)}`,
  category: "BÁNH",
  description,
  hsCode: "1234",
  origin: "VN",
  sampleQuantity: 1,
  unit: "PCE",
  unitPriceUsd: 1,
  kgPerUnit: 0.5,
  ...partial,
});

describe("catalogItemDedupeKey", () => {
  it("gom khoảng trắng và không phân biệt hoa thường", () => {
    expect(catalogItemDedupeKey("  Bánh  mì  ")).toBe(catalogItemDedupeKey("bánh mì"));
  });
});

describe("mergeImportedCatalogItems", () => {
  it("bỏ qua mặt hàng trùng mô tả", () => {
    const existing = [base("Bánh mì trắng")];
    const imported = [base("bánh mì trắng"), base("Bún tươi")];
    const result = mergeImportedCatalogItems(existing, imported);
    expect(result.added).toBe(1);
    expect(result.skippedDuplicate).toBe(1);
    expect(result.items).toHaveLength(2);
  });
});

describe("validateCatalogItemsForSave", () => {
  it("chặn mô tả trống và trùng", () => {
    expect(validateCatalogItemsForSave([base("")])).toEqual({
      ok: false,
      message: expect.stringContaining("chưa có mô tả"),
    });
    expect(
      validateCatalogItemsForSave([base("A"), base("a")]).ok
    ).toBe(false);
    expect(findDuplicateCatalogDescriptions([base("A"), base("a")])).toHaveLength(1);
  });
});

describe("parseInvoiceCatalogWorksheet", () => {
  it("đọc hàng từ cột A–I", () => {
    const ws = {
      rowCount: 3,
      getRow: (n: number) => ({
        getCell: (col: string) => {
          if (n === 2) {
            const map: Record<string, unknown> = {
              A: "BÁNH",
              B: "Bánh quy",
              C: "1905",
              D: "VN",
              E: 2,
              F: "BAG",
              G: 3.5,
              I: 0.4,
            };
            return { value: map[col] };
          }
          return { value: "" };
        },
      }),
    };
    const items = parseInvoiceCatalogWorksheet(ws);
    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe("Bánh quy");
    expect(items[0]?.category).toBe("BÁNH");
  });
});
