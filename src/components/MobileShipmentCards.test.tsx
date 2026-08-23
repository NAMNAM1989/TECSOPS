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
  it("card 2 dòng: AWB mono + status + một meta; không editor K/Kg", () => {
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
    expect(html).toContain("NAMNAM");
    expect(html).toContain("2K");
    expect(html).toContain("12.5kg");
    expect(html).not.toContain(">K<");
    expect(html).not.toContain("CNEE");
    expect(html).toContain("row-actions-menu-s1");
  });
});

describe("OpsMobileBookingFab", () => {
  it("một CTA + Booking, vùng chạm ≥44px, không thanh full-width", () => {
    const html = renderToStaticMarkup(
      <OpsMobileBookingFab activeWarehouse="TCS" onAdd={() => undefined} />,
    );
    expect(html).toContain("ops-mobile-booking-fab");
    expect(html).toContain("+ Booking");
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("sticky-mobile-actions");
    expect(html).not.toContain("shadow-apple-md");
    expect(html).not.toContain("Sửa lô");
  });
});
