import * as React from "react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { useEcargoKhoScscRegister } from "./useEcargoKhoScscRegister";
import type { Shipment } from "../types/shipment";

function khoScscRow(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: "ecargo-test-row",
    stt: 1,
    sessionDate: "2026-05-10",
    awb: "978-2556 2555",
    hawb: "",
    flight: "VJ85",
    flightDate: "10MAY",
    cutoff: "",
    cutoffNote: "",
    note: "",
    dest: "SYD",
    warehouse: "KHO-SCSC",
    pcs: 10,
    kg: 200,
    dimWeightKg: null,
    dimLines: null,
    dimDivisor: null,
    customer: "cyl",
    customerCode: "",
    status: "RECEIVED",
    ...overrides,
  };
}

function RegisterOnce({ row, viewYmd, vehicle }: { row: Shipment; viewYmd: string; vehicle: string }) {
  const { register } = useEcargoKhoScscRegister();
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    register(row, viewYmd, vehicle);
  }, [register, row, viewYmd, vehicle]);
  return null;
}

describe("useEcargoKhoScscRegister — luồng đăng ký xe", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("sau register: CustomEvent + postMessage chứa MAWB/vehicle/flightDate ISO đã chuẩn hóa", async () => {
    const row = khoScscRow();

    await act(async () => {
      root.render(
        React.createElement(RegisterOnce, {
          row,
          viewYmd: "2026-05-10",
          vehicle: "50H17480",
        })
      );
    });

    await act(async () => {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r());
      });
    });

    expect(window.dispatchEvent).toHaveBeenCalled();
    const customEv = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .find((e) => e instanceof CustomEvent && e.type === "ECARGO_REGISTER_FROM_OPS") as
      | CustomEvent<{ type: string; payload: Record<string, unknown> }>
      | undefined;

    expect(customEv).toBeDefined();
    const detail = customEv!.detail;
    expect(detail.type).toBe("ECARGO_REGISTER_FROM_OPS");
    expect(detail.payload).toMatchObject({
      vehicleNo: "50H17480",
      mawb: "978-25562555",
      flight: "VJ85",
      flightDate: "2026-05-10",
      destination: "SYD",
      pcs: 10,
      grossWeight: 200,
      warehouse: "SCSC",
      opsShipmentId: "ecargo-test-row",
      customerName: "cyl",
      hawb: "0",
      shc: "0",
      source: "ops",
    });

    expect(window.postMessage).toHaveBeenCalledWith(detail, "*");
  });

  it("không gửi khi thiếu điều kiện (số xe ngắn)", async () => {
    const row = khoScscRow();

    await act(async () => {
      root.render(
        React.createElement(RegisterOnce, {
          row,
          viewYmd: "2026-05-10",
          vehicle: "50H17",
        })
      );
    });

    await act(async () => {
      await new Promise<void>((r) => {
        requestAnimationFrame(() => r());
      });
    });

    expect(window.dispatchEvent).not.toHaveBeenCalled();
    expect(window.postMessage).not.toHaveBeenCalled();
  });
});
