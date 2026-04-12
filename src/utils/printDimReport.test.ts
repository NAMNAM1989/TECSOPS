import { describe, expect, it, vi, afterEach } from "vitest";
import type { Shipment } from "../types/shipment";
import { canPrintDimReport, diminsenRow, printDimReport } from "./printDimReport";

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
    status: "RECEIVED",
    ...over,
  };
}

describe("diminsenRow", () => {
  it("120×50×30 × 4 kiện ÷ 6000 = 120", () => {
    expect(diminsenRow(120, 50, 30, 4, 6000)).toBe(120);
  });

  it("cùng kích thước ÷ 5000 = 144", () => {
    expect(diminsenRow(120, 50, 30, 4, 5000)).toBe(144);
  });
});

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

describe("printDimReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("báo khi chưa có chi tiết DIM", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    printDimReport(sampleShipment({ dimLines: null }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("Chưa có chi tiết DIM"));
  });

  it("ghi HTML bảng in (MAWB, DIMINSEN, tổng PCS)", () => {
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
    printDimReport(sampleShipment());
    vi.runAllTimers();
    vi.useRealTimers();

    expect(mockDoc.write).toHaveBeenCalled();
    const html = String(mockDoc.write.mock.calls[0]?.[0] ?? "");
    expect(html).toContain("232-1234 5678");
    expect(html).toContain("VN123");
    expect(html).toContain("06APR");
    expect(html).toContain("DIMINSEN");
    expect(html).toContain("120.00");
    expect(html).toContain("KUL");
    const sumDiminsen = diminsenRow(120, 50, 30, 4, 6000) + diminsenRow(100, 80, 60, 1, 6000);
    expect(html).toContain(`>${sumDiminsen}<`);
    expect(mockWin.print).toHaveBeenCalled();
  });
});
