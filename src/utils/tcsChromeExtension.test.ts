import { describe, expect, it } from "vitest";
import { TCS_EXT_CHANNEL, TCS_EXT_INSTALL_HINT } from "./tcsChromeExtension";

describe("tcsChromeExtension", () => {
  it("keeps stable postMessage channel for Ops ↔ content-ops bridge", () => {
    expect(TCS_EXT_CHANNEL).toBe("tecsops-tcs-ext");
  });

  it("install hint mentions chrome-extension folder", () => {
    expect(TCS_EXT_INSTALL_HINT.toLowerCase()).toContain("chrome-extension");
  });
});
