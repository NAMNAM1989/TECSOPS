import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileShipmentCards, OpsMobileBookingFab } from "./MobileShipmentCards";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
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

describe("MobileShipmentCards", () => {
  it("card 2 dòng denser: AWB+DST+chuyến · khách+kg; không editor K/Kg", () => {
    const html = renderToStaticMarkup(
      <MobileShipmentCards
        rows={[row]}
        selectedId={null}
        onSelect={() => undefined}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onPrint={() => undefined}
        activeWarehouse="TCS"
        viewSessionYmd="2026-08-23"
      />,
    );
    expect(html).toContain("mobile-shipment-list");
    expect(html).toContain("176-1234 5675");
    expect(html).toContain("SGN");
    expect(html).toContain("VN623/23AUG");
    expect(html).toContain("NAMNAM");
    expect(html).toContain("2K");
    expect(html).toContain("12.5kg");
    expect(html).toContain("font-extrabold");
    expect(html).toContain("text-ui-navy");
    expect(html).not.toContain(">K<");
    expect(html).not.toContain("CNEE");
    expect(html).toContain("row-actions-menu-s1");
  });

  it("day-board A: spacing thẻ, padding card, status/menu dense, clearance FAB", () => {
    const html = renderToStaticMarkup(
      <MobileShipmentCards
        rows={[row]}
        selectedId={null}
        onSelect={() => undefined}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onPrint={() => undefined}
        activeWarehouse="TCS"
        viewSessionYmd="2026-08-23"
      />,
    );
    expect(html).toContain("space-y-1.5");
    expect(html).toContain("px-2.5 py-2");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("text-ui-awb");
    expect(html).toContain("text-[15px]");
    expect(html).toContain("h-7 w-full");
    expect(html).toContain("h-8 w-8");
    expect(html).not.toContain("h-11 w-full min-h-11");
    expect(html).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(html).toContain("scroll-mb-[calc(5rem+env(safe-area-inset-bottom))]");
  });
});

describe("OpsMobileBookingFab", () => {
  it("FAB tròn +, vùng chạm ≥56px, không thanh full-width", () => {
    const html = renderToStaticMarkup(
      <OpsMobileBookingFab activeWarehouse="TCS" onAdd={() => undefined} />,
    );
    expect(html).toContain("ops-mobile-booking-fab");
    expect(html).toContain("rounded-full");
    expect(html).toContain("min-h-14");
    expect(html).toContain("bottom-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(html).toContain(
      "[[data-ops-mobile-overlay=sheet]_&amp;]:invisible",
    );
    expect(html).not.toContain("sticky-mobile-actions");
    expect(html).not.toContain("+ Booking");
  });
});
