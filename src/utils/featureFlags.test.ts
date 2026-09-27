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

  it("uses legacy v1 colors when ui.v2 is disabled (default)", () => {
    setUiV2Enabled(false);
    // PENDING is blue, RECEIVED is amber
    expect(statusBadgeClass.PENDING).toContain("bg-blue-50");
    expect(statusBadgeClass.PENDING).toContain("text-blue-900");
    expect(statusBadgeClass.RECEIVED).toContain("bg-amber-50");
    expect(statusBadgeClass.RECEIVED).toContain("text-amber-950");

    // WEIGH_SLIP is solid green
    expect(statusBadgeClass.WEIGH_SLIP).toContain("bg-green-700");
    expect(statusBadgeClass.WEIGH_SLIP).toContain("text-white");

    // Legacy statuses have dashed borders
    expect(statusBadgeClass.COMPLETED).toContain("border-dashed");
    expect(statusBadgeClass.CUSTOMS).toContain("border-dashed");
    expect(statusBadgeClass.SECURITY).toContain("border-dashed");

    // Indicator dots
    expect(statusDotClass.PENDING).toBe("bg-blue-500");
    expect(statusDotClass.RECEIVED).toBe("bg-amber-500");

    // Card row accent border
    expect(statusRowAccent.PENDING).toContain("border-l-blue-500");
    expect(statusRowAccent.RECEIVED).toContain("border-l-amber-500");
  });

  it("swaps colors and styles when ui.v2 is enabled", () => {
    setUiV2Enabled(true);

    // PENDING is amber, RECEIVED is blue
    expect(statusBadgeClass.PENDING).toContain("bg-amber-50");
    expect(statusBadgeClass.PENDING).toContain("text-amber-800");
    expect(statusBadgeClass.RECEIVED).toContain("bg-blue-50");
    expect(statusBadgeClass.RECEIVED).toContain("text-blue-800");

    // WEIGH_SLIP is tint green
    expect(statusBadgeClass.WEIGH_SLIP).toContain("bg-green-50");
    expect(statusBadgeClass.WEIGH_SLIP).toContain("text-green-800");

    // Legacy statuses have solid borders (no border-dashed)
    expect(statusBadgeClass.COMPLETED).not.toContain("border-dashed");
    expect(statusBadgeClass.CUSTOMS).not.toContain("border-dashed");
    expect(statusBadgeClass.SECURITY).not.toContain("border-dashed");

    // Indicator dots
    expect(statusDotClass.PENDING).toBe("bg-amber-500");
    expect(statusDotClass.RECEIVED).toBe("bg-blue-500");

    // Card row accent border
    expect(statusRowAccent.PENDING).toContain("border-l-amber-500");
    expect(statusRowAccent.RECEIVED).toContain("border-l-blue-500");
  });
});
