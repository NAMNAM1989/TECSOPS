import { describe, expect, it } from "vitest";
import {
  formatQuickFillError,
  quickFillNeedsLoginError,
  resolveQuickFillWarehouse,
} from "./customerEsidQuickFill";

describe("customerEsidQuickFill", () => {
  it("resolveQuickFillWarehouse không hardcode một kho", () => {
    expect(resolveQuickFillWarehouse("TCS")).toBe("TCS");
    expect(resolveQuickFillWarehouse("TECS-TCS")).toBe("TECS-TCS");
    expect(resolveQuickFillWarehouse("tcs")).toBe("TCS");
    expect(resolveQuickFillWarehouse("")).toBe("TECS-TCS");
    expect(resolveQuickFillWarehouse(null, "TCS")).toBe("TCS");
    expect(resolveQuickFillWarehouse("SCSC")).toBe("TECS-TCS");
  });

  it("nhận diện lỗi cần ĐN lại", () => {
    expect(quickFillNeedsLoginError({ error: "NEEDS_LOGIN" })).toBe(true);
    expect(quickFillNeedsLoginError({ error: "WRONG_USER" })).toBe(true);
    expect(quickFillNeedsLoginError({ error: "PORTAL_BUSY" })).toBe(false);
  });

  it("format lỗi PORTAL_BUSY rõ ràng", () => {
    expect(
      formatQuickFillError({
        error: "PORTAL_BUSY",
        message: "Ext kho khác đang thao tác",
      })
    ).toContain("đang thao tác");
  });
});
