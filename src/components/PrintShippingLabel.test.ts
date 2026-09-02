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

describe("LabelContent — mẫu 4 hàng", () => {
  it("in Airline · AWB · Origin/Dest · TOTAL PIECES; origin luôn SGN", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment(),
      })
    );

    expect(html).toContain("lbl-sheet-inner");
    expect(html).toContain("AIR WAYBILL NO.");
    expect(html).toContain("ORIGIN:");
    expect(html).toContain("DESTINATION:");
    expect(html).toContain("TOTAL PIECES");
    expect(html).toContain("SGN");
    expect(html).toContain("NRT");
    expect(html).toContain("VIETNAM AIRLINES");
    expect(html).not.toContain("HAWB");
    expect(html).not.toContain("lbl-special");
    expect(html).not.toContain("lbl-frame");
  });

  it("maps shipment.pcs to TOTAL PIECES", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment({ pcs: 15 }),
      })
    );

    expect(html).toContain("TOTAL PIECES");
    expect(html).toMatch(/pieces-val[^>]*>15</);
  });

  it("chưa có số kiện → TOTAL PIECES để trống, không hiện dấu -", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment({ pcs: 0 }),
      })
    );

    expect(html).toContain("TOTAL PIECES");
    expect(html).toMatch(/pieces-val[^>]*><\/div>/);
    expect(html).not.toMatch(/pieces-val[^>]*>[\s\u2014\-—]+</);
  });

  it("compact 100×50 dùng class lbl-sheet--compact", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment(),
        sheetVariant: "compact",
      })
    );
    expect(html).toContain("lbl-sheet--compact");
  });
});

describe("PrintShippingLabel modal", () => {
  it("tiêu đề PRINT LABEL; 2 khổ; một nút PRINT; không ô số tem", () => {
    const currentDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });
    let html = "";
    try {
      html = renderToStaticMarkup(
        createElement(PrintShippingLabel, {
          shipment: shipment(),
          onClose: () => undefined,
        })
      );
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: currentDocument,
      });
    }

    expect(html).toContain("PRINT LABEL");
    expect(html).toContain(">PRINT<");
    expect(html).toContain("100×80 mm");
    expect(html).toContain("100×50 mm");
    expect(html).not.toContain("Số lượng tem");
    expect(html).not.toContain("Nhập số tem để in");
    expect(html).not.toContain("In thử 1");
    expect(html).not.toContain("Trang in");
    expect(html).not.toContain("Scale 100%");
    expect(html).not.toContain("XP-470B");
    expect(html).not.toContain("Theo kiện");
  });
});
