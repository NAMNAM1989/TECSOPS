import { describe, expect, it } from "vitest";
import {
  clipScscGoodsDescriptionPrint,
  clipScscOtherRequirementsPrint,
} from "./scscPrintContent";

describe("scscPrintContent", () => {
  it("clip goods theo max", () => {
    const long = "X".repeat(200);
    expect(clipScscGoodsDescriptionPrint(long).length).toBe(150);
  });

  it("clip other requirements theo max", () => {
    const long = "Y".repeat(250);
    expect(clipScscOtherRequirementsPrint(long).length).toBe(200);
  });
});
