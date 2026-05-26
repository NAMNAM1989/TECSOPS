import { describe, expect, it } from "vitest";
import {
  clipScscGoodsDescriptionPrint,
  resolveScscGoodsDescriptionPrint,
  resolveScscOtherRequirementsPrint,
} from "./scscPrintContent";

describe("scscPrintContent", () => {
  it("ưu tiên goodsDescriptionPrint trên lô", () => {
    expect(
      resolveScscGoodsDescriptionPrint(
        { goodsDescriptionPrint: "ON BOOKING", note: "NOTE" },
        { id: "g1", label: "X", goodsDescription: "TEMPLATE" }
      )
    ).toBe("ON BOOKING");
  });

  it("fallback mẫu khách rồi note", () => {
    expect(
      resolveScscGoodsDescriptionPrint(
        { goodsDescriptionPrint: "", note: "FROM NOTE" },
        { id: "g1", label: "X", goodsDescription: "TEMPLATE" }
      )
    ).toBe("TEMPLATE");
    expect(resolveScscGoodsDescriptionPrint({ goodsDescriptionPrint: "", note: "N" }, undefined)).toBe("N");
  });

  it("otherRequirements ưu tiên lô", () => {
    expect(
      resolveScscOtherRequirementsPrint(
        { otherRequirementsPrint: "LOT" },
        { id: "c", code: "A", name: "A", otherRequirementsPrint: "CUST" }
      )
    ).toBe("LOT");
  });

  it("clip goods theo max", () => {
    const long = "X".repeat(200);
    expect(clipScscGoodsDescriptionPrint(long).length).toBe(150);
  });
});
