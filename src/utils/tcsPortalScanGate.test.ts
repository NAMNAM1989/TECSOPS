import { describe, expect, it } from "vitest";
import {
  portalBusyUserMessage,
  shouldOpenExtLoginAfterScanFailure,
  shouldPromptExtLoginBeforeScan,
} from "./tcsPortalScanGate";

describe("tcsPortalScanGate", () => {
  it("không bắt ĐN khi còn username (kể cả session_dirty)", () => {
    expect(
      shouldPromptExtLoginBeforeScan({
        ok: true,
        workspace: {
          logged_in: false,
          logged_in_username: "namnam8012",
          session_dirty: true,
        },
      })
    ).toBe(false);
  });

  it("không bắt ĐN khi logged_in dù thiếu username (jar có thể đủ)", () => {
    expect(
      shouldPromptExtLoginBeforeScan({
        ok: true,
        workspace: { logged_in: true, logged_in_username: "" },
      })
    ).toBe(false);
  });

  it("bắt ĐN khi Ext ok nhưng không có session", () => {
    expect(
      shouldPromptExtLoginBeforeScan({
        ok: true,
        workspace: { logged_in: false, logged_in_username: "" },
      })
    ).toBe(true);
  });

  it("mở form ĐN sau Quét fail NEEDS_LOGIN / WRONG_USER", () => {
    expect(
      shouldOpenExtLoginAfterScanFailure({ ok: false, error: "NEEDS_LOGIN" })
    ).toBe(true);
    expect(
      shouldOpenExtLoginAfterScanFailure({ ok: false, error: "WRONG_USER" })
    ).toBe(true);
    expect(
      shouldOpenExtLoginAfterScanFailure({ ok: false, error: "PORTAL_BUSY" })
    ).toBe(false);
    expect(shouldOpenExtLoginAfterScanFailure({ ok: true })).toBe(false);
  });

  it("portalBusyUserMessage chỉ khi PORTAL_BUSY", () => {
    expect(
      portalBusyUserMessage({
        ok: false,
        error: "PORTAL_BUSY",
        message: "Ext kho khác đang thao tác",
      })
    ).toContain("Ext kho khác");
    expect(
      portalBusyUserMessage({ ok: false, error: "WRONG_USER" })
    ).toBeNull();
  });
});
