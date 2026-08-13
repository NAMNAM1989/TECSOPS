import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getPortalVisualControl,
  portalPolicyUsesAgent,
  resolvePortalExecutorOrder,
  setPortalVisualControl,
  shouldLockToExtensionVisual,
} from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("auto desktop: Ext trước, agent sau", () => {
    expect(
      resolvePortalExecutorOrder("login", {
        policy: "auto",
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("fill", {
        policy: "auto",
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("pdf", {
        policy: "auto",
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
  });

  it("auto không truyền isMobile: coi như desktop Ext→agent", () => {
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
  });

  it("auto mobile: chỉ agent", () => {
    expect(
      resolvePortalExecutorOrder("scan", { policy: "auto", isMobile: true })
    ).toEqual(["agent"]);
    expect(
      resolvePortalExecutorOrder("pdf", { policy: "auto", isMobile: true })
    ).toEqual(["agent"]);
    expect(
      resolvePortalExecutorOrder("login", { policy: "auto", isMobile: true })
    ).toEqual(["agent"]);
  });

  it("preferRemote bị bỏ qua — vẫn Ext → agent trên desktop", () => {
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        preferRemote: true,
        isMobile: false,
        visualControl: false,
      })
    ).toEqual(["extension", "agent"]);
  });

  it("trực quan + Ext online: chỉ Ext", () => {
    expect(
      resolvePortalExecutorOrder("fill", {
        policy: "auto",
        isMobile: false,
        visualControl: true,
        extensionOnline: true,
      })
    ).toEqual(["extension"]);
    expect(
      shouldLockToExtensionVisual({
        isMobile: false,
        visualControl: true,
        extensionOnline: true,
      })
    ).toBe(true);
  });

  it("trực quan nhưng không có Ext: vẫn Ext→agent", () => {
    expect(
      resolvePortalExecutorOrder("scan", {
        policy: "auto",
        isMobile: false,
        visualControl: true,
        extensionOnline: false,
      })
    ).toEqual(["extension", "agent"]);
    expect(
      shouldLockToExtensionVisual({
        isMobile: false,
        visualControl: true,
        extensionOnline: false,
      })
    ).toBe(false);
  });

  it("ext-only / agent-only / remote-only", () => {
    expect(resolvePortalExecutorOrder("login", { policy: "ext-only" })).toEqual([
      "extension",
    ]);
    expect(resolvePortalExecutorOrder("pdf", { policy: "agent-only" })).toEqual([
      "agent",
    ]);
    expect(resolvePortalExecutorOrder("fill", { policy: "remote-only" })).toEqual([
      "remote",
    ]);
  });

  it("portalPolicyUsesAgent", () => {
    expect(portalPolicyUsesAgent("auto")).toBe(true);
    expect(portalPolicyUsesAgent("agent-only")).toBe(true);
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
