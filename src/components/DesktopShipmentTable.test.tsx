import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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

const row = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  awb: "17612345675",
  customer: "NAMNAM",
  flight: "VN623",
  flightDate: "23AUG",
  dest: "SGN",
  pcs: 2,
  kg: 12.5,
} as Shipment;

function renderTable(rows: Shipment[] = [row]) {
  return renderToStaticMarkup(
    <ToastProvider>
      <DesktopShipmentTable
        rows={rows}
        allRows={rows}
        activeWarehouse="TCS"
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onPrint={() => undefined}
        onAddBlankRow={() => undefined}
        viewSessionYmd="2026-08-23"
      />
    </ToastProvider>,
  );
}

describe("DesktopShipmentTable density", () => {
  it("giữ cột ops + AWB mono 14px sticky; thead/cell/gap dày hơn", () => {
    const html = renderTable();
    expect(html).toContain("ops-desktop-shipment-table");
    expect(html).toContain("space-y-1");
    expect(html).not.toContain("space-y-1.5");
    expect(html).toContain("ops-table-head");
    expect(html).toContain("px-1 py-1");
    expect(html).toContain("px-1 py-0.5");
    expect(html).not.toContain("px-1.5 py-1.5");
    expect(html).not.toContain("px-1.5 py-2");
    expect(html).toContain("ops-awb");
    expect(html).toContain("text-[14px]");
    expect(html).toContain("sticky left-0");
    expect(html).toContain("AWB / HAWB");
    expect(html).toContain("CHUYẾN");
    expect(html).toContain("INFO KH");
    expect(html).toContain("STATUS");
    expect(html).toContain("THAO TÁC");
    expect(html).toContain("176");
  });

  it("status desktop dense h-7, không min-h-11; overflow-visible menu", () => {
    const html = renderTable();
    expect(html).toContain("h-7 w-full min-w-0 truncate px-1.5 text-[10px]");
    expect(html).not.toContain("h-11 w-full min-h-11");
    expect(html).toContain("overflow-visible py-0.5");
    expect(html).toContain("row-actions-menu-s1");
  });

  it("empty state vẫn + Booking primary ≥44px", () => {
    const html = renderTable([]);
    expect(html).toContain("+ Booking");
    expect(html).toContain("min-h-11");
  });
});
