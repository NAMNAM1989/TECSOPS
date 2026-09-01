import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileToolbar } from "./OpsMobileToolbar";
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
  pcs: 2,
  kg: 10,
} as Shipment;

const base = {
  activeWarehouse: "TCS" as const,
  viewRows: [row],
  statusFilter: "ALL" as const,
  onStatusFilterChange: () => undefined,
  onOpenSheetImport: () => undefined,
  onNavigateCustomers: () => undefined,
  onOpenAirlineLabels: () => undefined,
  onDownloadDayExcel: () => undefined,
  onCopyCargoDayReport: () => undefined,
};

describe("OpsMobileToolbar", () => {
  it("chip Tất cả + ⋯, không select cao / không Thêm ▾", () => {
    const html = renderToStaticMarkup(<OpsMobileToolbar {...base} />);
    expect(html).toContain("ops-mobile-toolbar");
    expect(html).toContain("ops-mobile-filter-chip");
    expect(html).toContain("Tất cả");
    expect(html).toContain("ops-mobile-tools-overflow");
    expect(html).toContain("⋯");
    expect(html).toContain("min-h-11");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Thêm ▾");
    expect(html).not.toContain("ops-mobile-chrome-sheet");
  });

  it("lọc Volume hiện đủ chữ, không ĐN", () => {
    const html = renderToStaticMarkup(
      <OpsMobileToolbar {...base} statusFilter="VOLUME_DONE" />,
    );
    expect(html).toContain("Đã đo Volume");
    expect(html).not.toContain("ĐN");
  });
});
