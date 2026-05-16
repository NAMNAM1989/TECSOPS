import { describe, expect, it } from "vitest";
import { resolveEffectiveThermalDeliveryMode } from "./printDeliveryMode";

describe("resolveEffectiveThermalDeliveryMode", () => {
  it("fallback browser khi TSPL nhưng chưa có IP", () => {
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", "")).toBe("browser-print");
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", "   ")).toBe("browser-print");
  });

  it("giữ TSPL khi có IP", () => {
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", "192.168.1.50")).toBe("tspl-tcp");
  });
});
