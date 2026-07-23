import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { LabelContent, PrintShippingLabel } from "./PrintShippingLabel";

function shipment(patch: Partial<Shipment> = {}): Shipment {
  return {
    id: "label-test",
    stt: 1,
    sessionDate: "2026-07-23",
    awb: "738-1234 5675",
    hawb: "HCM-001",
    flight: "VN123",
    flightDate: "23JUL",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "NRT",
    warehouse: "TECS-TCS",
    pcs: 3,
    kg: 20,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "TEST",
    customerCode: "TST",
    status: "RECEIVED",
    ...patch,
  };
}

describe("LabelContent print options", () => {
  it("automatically highlights HAWB and always uses SGN as origin", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment(),
        fontScale: 1,
        showHawbOnCompact: true,
      })
    );

    expect(html).toContain("lbl-sheet--house");
    expect(html).toContain("HAWB");
    expect(html).toContain("HCM-001");
    expect(html).toContain("SGN");
  });

  it("uses custom handling text and can hide it", () => {
    const visible = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment(),
        fontScale: 1,
        handlingText: "HANDLE WITH CARE",
      })
    );
    const hidden = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment(),
        fontScale: 1,
        handlingText: "HANDLE WITH CARE",
        showHandling: false,
      })
    );

    expect(visible).toContain("HANDLE WITH CARE");
    expect(hidden).not.toContain("HANDLE WITH CARE");
  });

  it("requires manual copy entry and exposes only the two approved sizes", () => {
    const currentDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: undefined });
    let html = "";
    try {
      html = renderToStaticMarkup(
        createElement(PrintShippingLabel, {
          shipment: shipment(),
          onClose: () => undefined,
        })
      );
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: currentDocument });
    }

    expect(html).toContain('aria-label="Số lượng tem"');
    expect(html).toContain('placeholder="Nhập"');
    expect(html).toContain("Nhập số tem để in");
    expect(html).toContain("100×80 mm");
    expect(html).toContain("100×50 mm");
    expect(html).not.toContain("Cuộn 80mm");
    expect(html).not.toContain("Theo kiện");
    expect(html).not.toContain(">Origin<input");
  });
});
