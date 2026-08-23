import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getPortalVisualControl,
  portalPolicyUsesAgent,
  resolvePortalExecutorOrder,
  setPortalVisualControl,
  shouldLockToExtensionVisual,
} from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("mọi policy / viewport: chỉ Ext (agent đã gỡ)", () => {
    expect(
      resolvePortalExecutorOrder("login", {
        policy: "auto",
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension"]);
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        isMobile: false,
        visualControl: true,
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
        visualControl: false,
        extensionOnline: false,
      })
    ).toBe(true);
    expect(
      shouldLockToExtensionVisual({
        isMobile: true,
        visualControl: true,
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

describe("portal visual control storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("mặc định bật; tắt/bật qua setter", () => {
    expect(getPortalVisualControl()).toBe(true);
    setPortalVisualControl(false);
    expect(getPortalVisualControl()).toBe(false);
    setPortalVisualControl(true);
    expect(getPortalVisualControl()).toBe(true);
  });
});
