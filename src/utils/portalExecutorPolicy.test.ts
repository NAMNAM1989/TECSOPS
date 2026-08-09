import { describe, expect, it } from "vitest";
import { resolvePortalExecutorOrder } from "./portalExecutorPolicy";

describe("resolvePortalExecutorOrder", () => {
  it("auto desktop: login/scan/fill ưu tiên Ext", () => {
    expect(resolvePortalExecutorOrder("login", { policy: "auto" })).toEqual([
      "extension",
      "agent",
      "remote",
    ]);
    expect(resolvePortalExecutorOrder("fill", { policy: "auto" })).toEqual([
      "extension",
      "agent",
      "remote",
    ]);
  });

  it("auto desktop: PDF ưu tiên agent", () => {
    expect(resolvePortalExecutorOrder("pdf", { policy: "auto" })).toEqual([
      "agent",
      "extension",
      "remote",
    ]);
  });

  it("preferRemote: remote trước rồi agent", () => {
    expect(
      resolvePortalExecutorOrder("scan", { policy: "auto", preferRemote: true })
    ).toEqual(["remote", "agent", "extension"]);
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
});
