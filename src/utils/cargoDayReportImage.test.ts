import { describe, expect, it } from "vitest";
import { cargoDayReportImageColWidths } from "./cargoDayReportImage";

describe("cargoDayReportImage layout", () => {
  it("Hiện Trường: Customer + Flight rộng, Cutoff hẹp để chữ rõ trên chat", () => {
    const w = cargoDayReportImageColWidths("withCustomer");
    expect(w.customer).toBeGreaterThanOrEqual(160);
    expect(w.flightDate).toBeGreaterThanOrEqual(230);
    expect(w.cutoff).toBeLessThanOrEqual(130);
    // Flight Hiện Trường không hẹp hơn mẫu Coppy Ảnh cơ bản
    expect(w.flightDate).toBeGreaterThanOrEqual(
      cargoDayReportImageColWidths("basic").flightDate!,
    );
  });

  it("Coppy Ảnh cơ bản: Flight rộng, Cutoff thu hẹp", () => {
    const w = cargoDayReportImageColWidths("basic");
    expect(w.flightDate).toBeGreaterThanOrEqual(200);
    expect(w.cutoff).toBeLessThanOrEqual(160);
    expect(w.customer).toBeUndefined();
  });
});
