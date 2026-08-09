import { describe, expect, it } from "vitest";
import { shouldPreferRemotePortal } from "./inlineTcsAgent";

describe("shouldPreferRemotePortal", () => {
  it("desktop luôn false", () => {
    expect(shouldPreferRemotePortal(false, true)).toBe(false);
    expect(shouldPreferRemotePortal(false, false)).toBe(false);
    expect(shouldPreferRemotePortal(false, null)).toBe(false);
  });

  it("mobile + agent nội bộ OK → không remote", () => {
    expect(shouldPreferRemotePortal(true, true)).toBe(false);
  });

  it("mobile + agent down → remote", () => {
    expect(shouldPreferRemotePortal(true, false)).toBe(true);
  });

  it("mobile chưa probe → remote tạm", () => {
    expect(shouldPreferRemotePortal(true, null)).toBe(true);
  });
});
