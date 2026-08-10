import { describe, expect, it } from "vitest";
import { shouldPreferRemotePortal } from "./inlineTcsAgent";

describe("shouldPreferRemotePortal", () => {
  it("luôn false — không remote máy kho", () => {
    expect(shouldPreferRemotePortal(false, true)).toBe(false);
    expect(shouldPreferRemotePortal(false, false)).toBe(false);
    expect(shouldPreferRemotePortal(false, null)).toBe(false);
    expect(shouldPreferRemotePortal(true, true)).toBe(false);
    expect(shouldPreferRemotePortal(true, false)).toBe(false);
    expect(shouldPreferRemotePortal(true, null)).toBe(false);
  });
});
