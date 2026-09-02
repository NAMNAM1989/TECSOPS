import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import { OpsContextStrip } from "./OpsContextStrip";

const row = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  pcs: 2,
  kg: 10,
  flightDate: "29AUG",
} as Shipment;

const baseProps = {
  selectedYmd: "2026-08-23",
  filteredViewRows: [row],
  viewRows: [row],
  activeWarehouse: "TCS" as const,
  onWarehouseChange: () => undefined,
  filtersActive: false,
  searchQuery: "",
  onSearchChange: () => undefined,
  flightDateFilter: "",
  onFlightDateChange: () => undefined,
  statusFilteredRows: [row],
  searchContext: { customers: [] },
  onSelectSearchMatch: () => undefined,
  statusFilter: "ALL" as const,
  onStatusFilterChange: () => undefined,
  onClearFilters: () => undefined,
};

describe("OpsContextStrip", () => {
  it("desktop: KPI + kho + tìm + lọc cùng một hàng", () => {
    const html = renderToStaticMarkup(
      <OpsContextStrip variant="desktop" {...baseProps} />,
    );
    expect(html).toContain("ops-context-strip");
    expect(html).toContain('data-variant="desktop"');
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("ops-desktop-context-row");
    expect(html).toContain("ops-desktop-filter-row");
    expect(html).toContain("Lọc trạng thái");
    expect(html).toContain("MAWB · xe · DEST");
  });

  it("mobile: filter row + nút ST khi status thu gọn", () => {
    const html = renderToStaticMarkup(
      <OpsContextStrip
        variant="mobile"
        {...baseProps}
        showMobileStatusBar={false}
        onExpandMobileStatus={() => undefined}
      />,
    );
    expect(html).toContain('data-variant="mobile"');
    expect(html).toContain("ops-mobile-filter-row");
    expect(html).toContain('aria-label="Lọc trạng thái"');
    expect(html).toContain("ST");
  });
});
