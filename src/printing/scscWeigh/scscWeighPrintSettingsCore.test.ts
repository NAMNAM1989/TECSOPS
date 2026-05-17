import { describe, expect, it } from "vitest";
import { clampScscWeighPrintSettings } from "./scscWeighPrintSettingsCore";

describe("clampScscWeighPrintSettings", () => {
  it("chuẩn hóa tên và SĐT", () => {
    expect(
      clampScscWeighPrintSettings({
        senderName: "  Nguyen Van A  ",
        senderPhone: "0901234567",
      })
    ).toEqual({ senderName: "Nguyen Van A", senderPhone: "0901234567" });
  });
});
