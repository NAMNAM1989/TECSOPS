import { describe, expect, it } from "vitest";
import type { CustomerSavedGoods } from "../types/customerDirectory";
import {
  buildShipmentPatchForSavedGoods,
  formatSavedGoodsDetailTitle,
  formatSavedGoodsShortLabel,
  isSavedGoodsSelectable,
} from "./customerPrintProfileLink";

function goods(over: Partial<CustomerSavedGoods> = {}): CustomerSavedGoods {
  return {
    id: "g1",
    label: "",
    goodsDescription: "",
    ...over,
  };
}

describe("formatSavedGoods — tên hàng từ hồ sơ KH", () => {
  it("ưu tiên goodsDescription (trường chính tab Tên hàng), không lấy label trước", () => {
    const g = goods({ label: "Alias ngắn", goodsDescription: "GARMENTS / TEXTILE" });
    expect(formatSavedGoodsShortLabel(g)).toBe("GARMENTS / TEXTILE");
    expect(formatSavedGoodsDetailTitle(g)).toContain("GARMENTS / TEXTILE");
    expect(formatSavedGoodsShortLabel(g)).not.toBe("Alias ngắn");
  });

  it("fallback label chỉ khi thiếu goodsDescription", () => {
    expect(formatSavedGoodsShortLabel(goods({ label: "GARMENT" }))).toBe("GARMENT");
  });

  it("patch lô ghi goodsDescriptionPrint từ goodsDescription", () => {
    const patch = buildShipmentPatchForSavedGoods(
      goods({ id: "g-9", label: "x", goodsDescription: "SEAFOOD FROZEN" }),
    );
    expect(patch.customerGoodsId).toBe("g-9");
    expect(patch.goodsDescriptionPrint).toBe("SEAFOOD FROZEN");
  });

  it("patch lô fallback label khi thiếu goodsDescription", () => {
    const patch = buildShipmentPatchForSavedGoods(
      goods({ id: "g-label", label: "CLOTHES PANTS", goodsDescription: "" }),
    );
    expect(patch.goodsDescriptionPrint).toBe("CLOTHES PANTS");
  });

  it("bỏ mục trống khỏi droplist", () => {
    expect(isSavedGoodsSelectable(goods())).toBe(false);
    expect(isSavedGoodsSelectable(goods({ goodsDescription: "A" }))).toBe(true);
  });
});
