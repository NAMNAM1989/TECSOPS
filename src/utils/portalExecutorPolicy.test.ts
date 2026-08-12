import { describe, expect, it } from "vitest";
import {
  portalPolicyUsesAgent,
  resolvePortalExecutorOrder,
} from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("auto desktop: Ext trước, agent sau", () => {
    expect(
      resolvePortalExecutorOrder("login", { policy: "auto", isMobile: false })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("scan", { policy: "auto", isMobile: false })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("fill", { policy: "auto", isMobile: false })
    ).toEqual(["extension", "agent"]);
    expect(
      resolvePortalExecutorOrder("pdf", { policy: "auto", isMobile: false })
    ).toEqual(["extension", "agent"]);
  });

  it("auto không truyền isMobile: coi như desktop Ext→agent", () => {
    expect(resolvePortalExecutorOrder("scan", { policy: "auto" })).toEqual([
      "extension",
      "agent",
    ]);
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
      })
    ).toEqual(["extension", "agent"]);
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
