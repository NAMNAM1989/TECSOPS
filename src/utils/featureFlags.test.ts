import { describe, expect, it, beforeEach } from "vitest";
import { isUiV2Enabled, setUiV2Enabled } from "./featureFlags";
import {
  statusBadgeClass,
  statusDotClass,
  statusRowAccent,
} from "../components/statusStyles";

describe("ui.v2 feature flag & status styling", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is disabled by default", () => {
    expect(isUiV2Enabled()).toBe(false);
  });

  it("enables when setUiV2Enabled(true) is called", () => {
    setUiV2Enabled(true);
    expect(isUiV2Enabled()).toBe(true);
    expect(window.localStorage.getItem("tecsops.ui.v2")).toBe("true");

    setUiV2Enabled(false);
    expect(isUiV2Enabled()).toBe(false);
    expect(window.localStorage.getItem("tecsops.ui.v2")).toBeNull();
  });

  it("uses the shared v4 status tokens and does not swap them with the flag", () => {
    setUiV2Enabled(false);
    expect(statusBadgeClass.PENDING).toContain("bg-st-pending-bg");
    expect(statusBadgeClass.RECEIVED).toContain("bg-st-received-bg");
    expect(statusBadgeClass.WEIGH_SLIP).toContain("bg-st-weigh-bg");
    expect(statusBadgeClass.RECEPTION_COMPLETED).toContain("bg-transparent");
    expect(statusBadgeClass.CUSTOMS).toContain("border-dashed");
    expect(statusDotClass.PENDING).toBe("bg-st-pending-bar");
    expect(statusRowAccent.RECEIVED).toContain("border-l-st-received-bar");

    const pending = statusBadgeClass.PENDING;
    setUiV2Enabled(true);
    expect(statusBadgeClass.PENDING).toBe(pending);
    expect(statusBadgeClass.RECEIVED).toContain("bg-st-received-bg");
  });
});
