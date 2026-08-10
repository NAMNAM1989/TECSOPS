import { describe, expect, it } from "vitest";
import {
  portalPolicyUsesAgent,
  resolvePortalExecutorOrder,
} from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("auto: agent cloud trước, Ext sau (online-first)", () => {
    expect(resolvePortalExecutorOrder("login", { policy: "auto" })).toEqual([
      "agent",
      "extension",
    ]);
    expect(resolvePortalExecutorOrder("scan", { policy: "auto" })).toEqual([
      "agent",
      "extension",
    ]);
    expect(resolvePortalExecutorOrder("fill", { policy: "auto" })).toEqual([
      "agent",
      "extension",
    ]);
    expect(resolvePortalExecutorOrder("pdf", { policy: "auto" })).toEqual([
      "agent",
      "extension",
    ]);
  });

  it("preferRemote bị bỏ qua — vẫn agent → Ext", () => {
    expect(
      resolvePortalExecutorOrder("scan", { policy: "auto", preferRemote: true })
    ).toEqual(["agent", "extension"]);
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
