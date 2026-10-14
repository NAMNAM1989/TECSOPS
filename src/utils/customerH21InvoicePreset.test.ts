import { describe, expect, it } from "vitest";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildCustomerH21GoodsFromCatalogRows,
  buildCustomerH21GoodsFromQueries,
  clampCustomerH21InvoicePresets,
  getCustomerH21Preset,
  isCustomerH21DataBound,
  resolveBoundCustomerH21WorkingCatalog,
  upsertCustomerH21GoodsItems,
  upsertCustomerH21Preset,
  withPreferredCustomerCargoFamilyMode,
  withPreferredLineCountOnCustomerSplits,
} from "./customerH21InvoicePreset";

const entryBase: CustomerDirectoryEntry = {
  id: "c1",
  code: "MKH",
  name: "MINH KHANG",
  parties: [],
};

describe("customerH21InvoicePreset — snapshot riêng KH", () => {
  it("clamp giữ items theo warehouseScope", () => {
    const list = clampCustomerH21InvoicePresets([
      {
        warehouseScope: "SCSC",
        items: [
          { id: "1", description: "Ao thun", unitFactor: 0.2 },
          { id: "1", description: "dup", unitFactor: 1 },
        ],
      },
      {
        warehouseScope: "TCS",
        items: [{ id: "t1", description: "Hang TCS", unitFactor: 1 }],
      },
    ]);
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.warehouseScope === "SCSC")?.items?.[0]?.description).toBe(
      "Ao thun"
    );
  });

  it("Excel catalog rows → giữ HS / giá / quy cách (minh khang.xlsx style)", () => {
    const items = buildCustomerH21GoodsFromCatalogRows([
      {
        id: "x",
        category: "BÁNH",
        description: "Bánh gạo An An (250g/bag)",
        hsCode: "19059090",
        origin: "VIETNAM",
        uom1: "BAG",
        unitPrice: 0.3,
        unitFactor: 0.25,
        active: true,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.category).toBe("BÁNH");
    expect(items[0]?.hsCode).toBe("19059090");
    expect(items[0]?.unitFactor).toBe(0.25);
    expect(items[0]?.unitPrice).toBe(0.3);
  });

  it("bound H21: chỉ pool snapshot KH", () => {
    const next = upsertCustomerH21Preset(entryBase, {
      warehouseScope: "SCSC",
      items: [
        {
          id: "kh1",
          description: "SP rieng Minh Khang",
          unitFactor: 0.5,
          category: "KH",
          hsCode: "1905",
        },
      ],
      catalogItemIds: [],
    });
    const preset = getCustomerH21Preset(next, "SCSC");
    expect(isCustomerH21DataBound(preset)).toBe(true);
    const hit = resolveBoundCustomerH21WorkingCatalog(
      [{ id: "shared", description: "Hang chung", unitFactor: 1, active: true }],
      preset,
      { warehouseScope: "SCSC" }
    );
    expect(hit.pool.map((x) => x.description)).toEqual(["SP rieng Minh Khang"]);
    expect(hit.pool[0]?.hsCode).toBe("1905");
  });

  it("upload queries + merge/replace + prefer mode", () => {
    const built = buildCustomerH21GoodsFromQueries(["Hang A"], []);
    expect(built.items[0]?.unitFactor).toBe(1);
    const p = upsertCustomerH21GoodsItems(null, "SCSC", built.items, "replace");
    expect(p.items).toHaveLength(1);
    expect(
      withPreferredCustomerCargoFamilyMode([{ cargoFamilyMode: "customer", lines: [] }], true)[0]
        ?.cargoFamilyMode
    ).toBe("auto");
    expect(
      withPreferredLineCountOnCustomerSplits(
        [{ cargoFamilyMode: "food", lines: [], lineCountDraft: "15" }],
        12
      )[0]?.lineCountDraft
    ).toBe("12");
  });
});
