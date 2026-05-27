import { describe, expect, it } from "vitest";
import { resolveEffectiveThermalDeliveryMode } from "./printDeliveryMode";

describe("resolveEffectiveThermalDeliveryMode", () => {
  it("fallback browser khi TSPL nhưng chưa có IP", () => {
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", {})).toBe("browser-print");
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", { host: "" })).toBe("browser-print");
  });

  it("giữ TSPL khi có IP", () => {
    expect(resolveEffectiveThermalDeliveryMode("tspl-tcp", { host: "192.168.1.50" })).toBe("tspl-tcp");
  });

  it("ưu tiên local-bridge khi có tên Windows và bridge online", () => {
    expect(
      resolveEffectiveThermalDeliveryMode("browser-print", { windowsPrinterName: "XPrinter-80" }, true)
    ).toBe("local-bridge");
  });

  it("local-bridge không có bridge → browser", () => {
    expect(
      resolveEffectiveThermalDeliveryMode("local-bridge", { windowsPrinterName: "XPrinter-80" }, false)
    ).toBe("browser-print");
  });
});
