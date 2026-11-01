import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Shipment } from "../types/shipment";
import { LabelContent, PrintShippingLabel } from "./PrintShippingLabel";
import {
  labelPrintIssues,
  mapShipmentToAirCargoLabelData,
} from "../utils/mapShipmentToAirCargoLabelData";

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

const caps = (html: string) => [...html.matchAll(/lbl-cap">([^<]+)</g)].map((m) => m[1]);

describe("LabelContent — talon esid-desktop", () => {
  it("100×50: CARRIER · AWB · ORIGIN | DEST · TOTAL NO. OF PIECES, không HAWB", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, { s: shipment({ hawb: "" }), sheetVariant: "compact" })
    );
    expect(html).toContain("lbl-sheet--compact");
    expect(caps(html)).toEqual(["CARRIER", "AWB", "ORIGIN", "DEST", "TOTAL NO. OF PIECES"]);
    expect(html).toContain("grid-template-rows:7mm 13.3mm 10.1mm 18.6mm");
    expect(html).toMatch(/font-size:36pt">738-1234 5675</);
    expect(html).toMatch(/font-size:24pt">NRT</);
    expect(html).toContain("VIETNAM AIRLINES");
    expect(html).toContain(">SGN<");
  });

  it("100×80 không HAWB: 4 hàng, DEST 30pt, số kiện 48pt", () => {
    const html = renderToStaticMarkup(createElement(LabelContent, { s: shipment({ hawb: "" }) }));
    expect(caps(html)).toEqual(["CARRIER", "AWB", "ORIGIN", "DEST", "TOTAL NO. OF PIECES"]);
    expect(html).toContain("grid-template-rows:12mm 19.5mm 17.5mm 29mm");
    expect(html).toMatch(/font-size:30pt">NRT</);
    expect(html).toMatch(/font-size:48pt">3</);
  });

  it("100×80 có HAWB: thêm hàng HAWB in hoa sau AWB", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, { s: shipment({ hawb: "nnl26103012" }) })
    );
    expect(caps(html)).toEqual(["CARRIER", "AWB", "HAWB", "ORIGIN", "DEST", "TOTAL NO. OF PIECES"]);
    expect(html).toContain("grid-template-rows:10mm 15.5mm 10.5mm 13.5mm 28.5mm");
    expect(html).toContain(">NNL26103012<");
  });

  it("ô trống để trống, không chữ gợi ý", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, { s: shipment({ awb: "", dest: "", pcs: 0, hawb: "", flight: "" }) })
    );
    expect(caps(html)).toEqual(["CARRIER", "AWB", "ORIGIN", "DEST", "TOTAL NO. OF PIECES"]);
    expect(html).not.toContain("Nhập MAWB");
    expect(html).not.toContain("lbl-placeholder");
    expect(html.match(/lbl-v"/g)).toHaveLength(1); // chỉ còn ORIGIN SGN
  });

  it("tên hãng dài tự thu nhỏ dưới 14pt", () => {
    const html = renderToStaticMarkup(
      createElement(LabelContent, {
        s: shipment({ flight: "CO123", hawb: "" }),
        airlineLabelOverrides: {
          byAwbPrefix: {},
          byFlightPrefix: { CO: "NORTH-WESTERN CARGO INTERNATIONAL AIRLINES" },
        },
        airlineReplaceDefaults: true,
        sheetVariant: "compact",
      })
    );
    const pt = Number(/font-size:([\d.]+)pt">NORTH-WESTERN/.exec(html)?.[1]);
    expect(pt).toBeGreaterThan(5);
    expect(pt).toBeLessThan(14);
  });
});

describe("labelPrintIssues — chặn in như talon", () => {
  const issues = (patch: Partial<Shipment>, format: "100x80" | "100x50" = "100x80") =>
    labelPrintIssues(mapShipmentToAirCargoLabelData(shipment(patch)), format);

  it("lô đủ dữ liệu: không lỗi, không cảnh báo", () => {
    expect(issues({})).toEqual({ errors: [], warnings: [] });
  });

  it("AWB thiếu số hoặc sai số kiểm tra → chặn", () => {
    expect(issues({ awb: "738-1234" }).errors.join()).toMatch(/11 số/);
    expect(issues({ awb: "738-1234 5678" }).errors.join()).toMatch(/số kiểm tra.*5/);
  });

  it("DEST không phải 3 chữ cái → chặn", () => {
    expect(issues({ dest: "" }).errors.join()).toMatch(/DEST/);
    expect(issues({ dest: "NR1" }).errors.join()).toMatch(/DEST/);
  });

  it("có HAWB mà chọn 100×50 → chặn; 100×80 thì được", () => {
    expect(issues({ hawb: "H1" }, "100x50").errors.join()).toMatch(/100×80/);
    expect(issues({ hawb: "H1" }, "100x80").errors).toEqual([]);
  });

  it("hãng lạ và chưa có số kiện chỉ cảnh báo", () => {
    const r = issues({ flight: "Q9123", awb: "868-7654 3213", pcs: null });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/"Q9"/);
    expect(r.warnings.join()).toMatch(/số kiện/);
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
