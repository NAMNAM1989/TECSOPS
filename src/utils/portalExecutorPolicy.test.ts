import { describe, expect, it } from "vitest";
import {
  portalPolicyUsesAgent,
  resolvePortalExecutorOrder,
  shouldLockToExtensionVisual,
} from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("mọi policy / viewport: chỉ Ext (agent đã gỡ)", () => {
    expect(
      resolvePortalExecutorOrder("login", {
        policy: "auto",
        isMobile: false,
      })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        isMobile: false,
      })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("fill", {
        policy: "auto",
        isMobile: true,
      })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("pdf", { policy: "agent-only" })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("login", { policy: "remote-only" })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("scan", { policy: "ext-only" })
    ).toEqual(["extension"]);
  });

  it("desktop luôn khóa Ext; mobile không khóa (UI báo cần Ext trên PC)", () => {
    expect(
      shouldLockToExtensionVisual({
        isMobile: false,
        extensionOnline: false,
      })
    ).toBe(true);
    expect(
      shouldLockToExtensionVisual({
        isMobile: true,
        extensionOnline: false,
      })
    ).toBe(false);
  });

  it("portalPolicyUsesAgent luôn false", () => {
    expect(portalPolicyUsesAgent("auto")).toBe(false);
    expect(portalPolicyUsesAgent("agent-only")).toBe(false);
    expect(portalPolicyUsesAgent("ext-only")).toBe(false);
  });
});
