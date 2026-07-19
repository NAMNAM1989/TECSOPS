import { describe, expect, it, vi, afterEach } from "vitest";
import type { Shipment } from "../types/shipment";
import { canPrintDimReport, canPrintDimScscReport, printDimReport } from "./printDimReport";
import {
  formatDimKgDisplay,
  formatLineDimKgDisplay,
  lineDimKg,
  totalDimKgFromLines,
} from "./volumetricDim";
import { scscDimDivisor } from "./scscDimListReport";

function sampleShipment(over: Partial<Shipment> = {}): Shipment {
  return {
    id: "x",
    stt: 1,
    sessionDate: "2026-04-06",
    awb: "232-1234 5678",
    flight: "VN123",
    flightDate: "06APR",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "KUL",
    warehouse: "TECS-SCSC",
    pcs: 4,
    kg: 100,
    dimWeightKg: 120,
    dimDivisor: 6000,
    dimLines: [
      { lCm: 120, wCm: 50, hCm: 30, pcs: 4 },
      { lCm: 100, wCm: 80, hCm: 60, pcs: 1 },
    ],
    customer: "TEST",
    customerCode: "",
    status: "RECEIVED",
    ...over,
  };
}

describe("canPrintDimReport", () => {
  it("false khi không có dimLines", () => {
    expect(canPrintDimReport(sampleShipment({ dimLines: null }))).toBe(false);
  });

  it("false khi dimLines rỗng", () => {
    expect(canPrintDimReport(sampleShipment({ dimLines: [] }))).toBe(false);
  });

  it("true khi có ít nhất một dòng", () => {
    expect(canPrintDimReport(sampleShipment())).toBe(true);
  });
});

describe("canPrintDimScscReport", () => {
  it("true khi SCSC và có dimLines", () => {
    expect(canPrintDimScscReport(sampleShipment())).toBe(true);
  });

  it("false khi kho TCS dù có dimLines", () => {
    expect(canPrintDimScscReport(sampleShipment({ warehouse: "TECS-TCS" }))).toBe(false);
    expect(canPrintDimScscReport(sampleShipment({ warehouse: "TECS-TCS" }))).toBe(false);
  });

  it("true khi KHO SCSC và có dimLines", () => {
    expect(canPrintDimScscReport(sampleShipment({ warehouse: "TECS-SCSC" }))).toBe(true);
  });
});

describe("printDimReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("báo khi chưa có chi tiết DIM", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    printDimReport(sampleShipment({ dimLines: null }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("Chưa có chi tiết DIM"));
  });

  it("từ chối kho TCS dù có dimLines", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    printDimReport(sampleShipment({ warehouse: "TECS-TCS" }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("TCS"));
  });

  it("từ chối KHO TCS dù có dimLines", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    printDimReport(sampleShipment({ warehouse: "TECS-TCS" }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("SCSC"));
  });

  it("ghi HTML meta + bảng DIM (kg) theo lineDimKg như modal", () => {
    const mockDoc = {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
      readyState: "complete",
    };
    const mockWin = {
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn(),
    };

    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      if (node instanceof HTMLIFrameElement) {
        Object.defineProperty(node, "contentDocument", { value: mockDoc, configurable: true });
        Object.defineProperty(node, "contentWindow", { value: mockWin, configurable: true });
      }
      return node;
    });

    const s = sampleShipment();
    const dimCtx = { flight: s.flight, awb: s.awb };
    const div = scscDimDivisor(s);
    const kg1 = lineDimKg(s.dimLines![0]!, div, dimCtx);
    const kg2 = lineDimKg(s.dimLines![1]!, div, dimCtx);
    const total = totalDimKgFromLines(s.dimLines!, div, dimCtx);

    vi.useFakeTimers();
    printDimReport(s);
    vi.runAllTimers();
    vi.useRealTimers();

    expect(mockDoc.write).toHaveBeenCalled();
    const html = String(mockDoc.write.mock.calls[0]?.[0] ?? "");
    expect(html).toContain("232-1234 5678");
    expect(html).toContain("VN123");
    expect(html).toContain("06APR");
    expect(html).toContain("DIM (kg)</th>");
    expect(html).not.toContain("DIMINSEN");
    expect(html).toContain("120.00");
    expect(html).not.toMatch(/>\d+\s+ƯT</);
    expect(html).toContain("KUL");
    expect(html).toContain("Tổng kiện");
    expect(html).toContain(`${formatDimKgDisplay(total!, dimCtx)} kg`);
    expect(html).toContain(escHtml(formatLineDimKgDisplay(kg1!, dimCtx)));
    expect(html).toContain(escHtml(formatLineDimKgDisplay(kg2!, dimCtx)));
    expect(mockWin.print).toHaveBeenCalled();
  });

  it("kiện ước tính: form in không có cột GHI CHÚ", () => {
    const mockDoc = {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
      readyState: "complete",
    };
    const mockWin = {
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn(),
    };

    vi.spyOn(document.body, "appendChild").mockImplementation((node: Node) => {
      if (node instanceof HTMLIFrameElement) {
        Object.defineProperty(node, "contentDocument", { value: mockDoc, configurable: true });
        Object.defineProperty(node, "contentWindow", { value: mockWin, configurable: true });
      }
      return node;
    });

    vi.useFakeTimers();
    printDimReport(
      sampleShipment({
        flight: "TR517",
        dimLines: [
          { lCm: 35, wCm: 35, hCm: 35, pcs: 1 },
          { lCm: 30, wCm: 25, hCm: 20, pcs: 9, estimated: true },
        ],
      })
    );
    vi.runAllTimers();
    vi.useRealTimers();

    const html = String(mockDoc.write.mock.calls[0]?.[0] ?? "");
    expect(html).not.toContain("GHI CHÚ");
    expect(html).not.toContain(">ƯT<");
    expect(html).not.toMatch(/class="num dim">\d+\s+ƯT/);
  });
});

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
