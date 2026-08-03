import { describe, expect, it } from "vitest";
import {
  cargoDayReportImageColWidths,
  resolveCargoDayReportCopyKind,
} from "./cargoDayReportImage";

describe("cargoDayReportImage layout", () => {
  it("Tecs: AWB đủ rộng, Customer/Flight rõ, Cutoff hẹp", () => {
    const w = cargoDayReportImageColWidths("withCustomer");
    // `160-1234 5675` mono 17px cần ~180px+ padding
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.customer).toBeGreaterThanOrEqual(170);
    expect(w.flightDate).toBeGreaterThanOrEqual(250);
    expect(w.cutoff).toBeLessThanOrEqual(120);
    // Flight Tecs không hẹp hơn mẫu Vantage cơ bản
    expect(w.flightDate).toBeGreaterThanOrEqual(
      cargoDayReportImageColWidths("basic").flightDate!,
    );
  });

  it("Vantage: AWB + Flight rộng, Cutoff thu hẹp", () => {
    const w = cargoDayReportImageColWidths("basic");
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.flightDate).toBeGreaterThanOrEqual(200);
    expect(w.cutoff).toBeLessThanOrEqual(160);
    expect(w.customer).toBeUndefined();
  });

  it("resolve copy kind — Vantage / Tecs / kho", () => {
    expect(resolveCargoDayReportCopyKind("vantage")).toMatchObject({
      variant: "basic",
      family: null,
      label: "Vantage",
    });
    expect(resolveCargoDayReportCopyKind("tecs")).toMatchObject({
      variant: "withCustomer",
      family: null,
      label: "Tecs",
    });
    expect(resolveCargoDayReportCopyKind("tcs").family).toBe("TCS");
    expect(resolveCargoDayReportCopyKind("scsc").family).toBe("SCSC");
  });
});
