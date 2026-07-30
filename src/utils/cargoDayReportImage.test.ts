import { describe, expect, it } from "vitest";
import { cargoDayReportImageColWidths } from "./cargoDayReportImage";

describe("cargoDayReportImage layout", () => {
  it("Hiện Trường: AWB đủ rộng, Customer/Flight rõ, Cutoff hẹp", () => {
    const w = cargoDayReportImageColWidths("withCustomer");
    // `160-1234 5675` mono 17px cần ~180px+ padding
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.customer).toBeGreaterThanOrEqual(150);
    expect(w.flightDate).toBeGreaterThanOrEqual(220);
    expect(w.cutoff).toBeLessThanOrEqual(120);
    // Flight Hiện Trường không hẹp hơn mẫu Coppy Ảnh cơ bản
    expect(w.flightDate).toBeGreaterThanOrEqual(
      cargoDayReportImageColWidths("basic").flightDate!,
    );
  });

  it("Coppy Ảnh cơ bản: AWB + Flight rộng, Cutoff thu hẹp", () => {
    const w = cargoDayReportImageColWidths("basic");
    expect(w.booking).toBeGreaterThanOrEqual(190);
    expect(w.flightDate).toBeGreaterThanOrEqual(200);
    expect(w.cutoff).toBeLessThanOrEqual(160);
    expect(w.customer).toBeUndefined();
  });
});
