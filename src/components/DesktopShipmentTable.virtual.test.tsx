import { beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { DesktopShipmentTable } from "./DesktopShipmentTable";
import { ToastProvider } from "../ui";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

describe("DesktopShipmentTable Virtual Scroll", () => {
  it("renders fewer than 80 <tr> elements in DOM when given 2,000 shipments", () => {
    // Giả lập 2.000 dòng dữ liệu
    const twoThousandRows: Shipment[] = Array.from({ length: 2000 }, (_, i) => ({
      ...blankShipmentDraft("2026-10-06", "TCS"),
      id: `s-${i + 1}`,
      stt: i + 1,
      awb: `1760000${String(i).padStart(4, "0")}`,
      customer: `KHACH ${i + 1}`,
      flight: "VN123",
      flightDate: "06OCT",
      dest: "SGN",
      pcs: 10,
      kg: 100,
      warehouse: "TCS",
    }));

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ToastProvider>
          <DesktopShipmentTable
            rows={twoThousandRows}
            allRows={twoThousandRows}
            activeWarehouse="TCS"
            viewSessionYmd="2026-10-06"
            onUpdate={() => {}}
            onDelete={() => {}}
            onPrint={() => {}}
          />
        </ToastProvider>
      );
    });

    const renderedTrs = container.querySelectorAll("tbody tr");
    // Bảng 2.000 dòng chỉ render cửa sổ hiển thị + overscan + spacer (< 80 dòng)
    expect(renderedTrs.length).toBeLessThan(80);
    expect(renderedTrs.length).toBeGreaterThan(0);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
