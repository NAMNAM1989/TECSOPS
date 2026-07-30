import { describe, expect, it } from "vitest";
import { cargoDayReportImageColWidths } from "./cargoDayReportImage";

describe("cargoDayReportImage layout", () => {
  it("Hiện Trường: Customer + Flight rộng hơn để đọc rõ trên chat", () => {
    const w = cargoDayReportImageColWidths("withCustomer");
    expect(w.customer).toBeGreaterThanOrEqual(150);
    expect(w.flightDate).toBeGreaterThanOrEqual(220);
    // Flight Hiện Trường không hẹp hơn mẫu Coppy Ảnh cơ bản
    expect(w.flightDate).toBeGreaterThanOrEqual(
      cargoDayReportImageColWidths("basic").flightDate!,
    );
  });

  it("Coppy Ảnh cơ bản: vẫn có Flight rộng", () => {
    const w = cargoDayReportImageColWidths("basic");
    expect(w.flightDate).toBeGreaterThanOrEqual(200);
    expect(w.customer).toBeUndefined();
  });
});
