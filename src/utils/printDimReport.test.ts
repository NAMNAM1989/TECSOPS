import { describe, expect, it, vi, afterEach } from "vitest";
import type { Shipment } from "../types/shipment";
import { canPrintDimReport, canPrintDimScscReport, printDimReport } from "./printDimReport";
import {
  dimRoundingPolicyFromFlight,
  formatDimKgDisplay,
  lineDimKg,
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
    expect(canPrintDimScscReport(sampleShipment({ warehouse: "KHO-TCS" }))).toBe(false);
  });

  it("true khi KHO SCSC và có dimLines", () => {
    expect(canPrintDimScscReport(sampleShipment({ warehouse: "KHO-SCSC" }))).toBe(true);
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
    printDimReport(sampleShipment({ warehouse: "KHO-TCS" }));
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
    const policy = dimRoundingPolicyFromFlight(s.flight);
    const div = scscDimDivisor(s);
    const kg1 = lineDimKg(s.dimLines![0]!, div, policy);
    const kg2 = lineDimKg(s.dimLines![1]!, div, policy);

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
    expect(html).toContain("KUL");
    expect(html).toContain("Tổng kiện");
    expect(html).toContain("120 kg");
    expect(html).toContain(escHtml(formatDimKgDisplay(kg1!, policy)));
    expect(html).toContain(escHtml(formatDimKgDisplay(kg2!, policy)));
    expect(mockWin.print).toHaveBeenCalled();
  });
});

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
