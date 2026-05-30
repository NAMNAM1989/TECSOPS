import { describe, expect, it } from "vitest";
import type { InvoiceCatalogItem } from "../types/invoiceItem";
import {
  catalogItemDedupeKey,
  findDuplicateCatalogDescriptions,
  mergeCatalogDraftWithBase,
  mergeImportedCatalogItems,
  parseInvoiceCatalogWorksheet,
  validateCatalogItemsForSave,
} from "./invoiceCatalogExcel";

const makeItem = (description: string, partial?: Partial<InvoiceCatalogItem>): InvoiceCatalogItem => ({
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

describe("mergeCatalogDraftWithBase", () => {
  it("seed base khi draft trống", () => {
    const seeded = [makeItem("Bánh mì")];
    expect(mergeCatalogDraftWithBase([], seeded)).toHaveLength(1);
  });

  it("giữ pending khi base load sau", () => {
    const pending = [{ ...makeItem(""), description: "", category: "KHÁC" }];
    const merged = mergeCatalogDraftWithBase(pending, [makeItem("Có sẵn")]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.description).toBe("");
  });
});

describe("mergeImportedCatalogItems", () => {
  it("bỏ qua mặt hàng trùng mô tả", () => {
    const existing = [makeItem("Bánh mì trắng")];
    const imported = [makeItem("bánh mì trắng"), makeItem("Bún tươi")];
    const result = mergeImportedCatalogItems(existing, imported);
    expect(result.added).toBe(1);
    expect(result.skippedDuplicate).toBe(1);
    expect(result.items).toHaveLength(2);
  });
});

describe("validateCatalogItemsForSave", () => {
  it("chặn mô tả trống và trùng", () => {
    expect(validateCatalogItemsForSave([makeItem("")])).toEqual({
      ok: false,
      message: expect.stringContaining("chưa có mô tả"),
    });
    expect(
      validateCatalogItemsForSave([makeItem("A"), makeItem("a")]).ok
    ).toBe(false);
    expect(findDuplicateCatalogDescriptions([makeItem("A"), makeItem("a")])).toHaveLength(1);
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
