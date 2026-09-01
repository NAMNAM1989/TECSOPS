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
  it("card 3 dòng: MAWB · DEST · ⋯; flight · pcs/kg; khách — không dropdown Volume/Nhận", () => {
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
    expect(html).toContain("NAMNAM");
    expect(html).toContain("VN623/23AUG");
    expect(html).toContain("2 / 12.5 kg");
    expect(html).toContain("border-l-[3px]");
    expect(html).toContain("border-l-cyan-500");
    expect(html).not.toContain(">K<");
    expect(html).not.toContain("CNEE");
    expect(html).not.toContain("Trạng thái ·");
    expect(html).not.toContain("h-11 w-full min-h-11");
    expect(html).toContain("row-actions-menu-s1");
    expect(html).toContain("min-h-11 min-w-11");
  });

  it("pad 12 / gap 8 / MAWB 15/600 / clearance FAB + 24", () => {
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
    expect(html).toContain("space-y-2");
    expect(html).toContain("px-3 py-3");
    expect(html).toContain("rounded-ui-md");
    expect(html).toContain("shadow-ui-sm");
    expect(html).toContain("text-[15px]");
    expect(html).toContain("font-semibold");
    expect(html).toContain("text-ui-awb");
    expect(html).toContain("pb-[calc(148px+max(12px,env(safe-area-inset-bottom)))]");
    expect(html).toContain("scroll-mb-[calc(148px+max(12px,env(safe-area-inset-bottom)))]");
  });
});

describe("OpsMobileBookingFab", () => {
  it("FAB tròn +, 56px, right 16, trên nav+safe-area+16", () => {
    const html = renderToStaticMarkup(
      <OpsMobileBookingFab activeWarehouse="TCS" onAdd={() => undefined} />,
    );
    expect(html).toContain("ops-mobile-booking-fab");
    expect(html).toContain("rounded-full");
    expect(html).toContain("min-h-14");
    expect(html).toContain("right-4");
    expect(html).toContain("bottom-[calc(52px+max(12px,env(safe-area-inset-bottom))+16px)]");
    expect(html).toContain(
      "[[data-ops-mobile-overlay=sheet]_&amp;]:invisible",
    );
    expect(html).not.toContain("sticky-mobile-actions");
    expect(html).not.toContain("+ Booking");
  });
});
