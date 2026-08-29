import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import type { Shipment } from "../types/shipment";
import { ToastProvider } from "../ui";
import { blankShipmentDraft } from "../utils/blankShipment";

const emptySearch = {
  customers: [],
};

function renderHeader(opts: { empty?: boolean } = {}) {
  const row = {
    ...blankShipmentDraft("2026-08-23", "TCS"),
    id: "s1",
    stt: 1,
    awb: "17612345675",
    pcs: 2,
    kg: 10,
  } as Shipment;
  const rows = opts.empty ? [] : [row];
  return renderToStaticMarkup(
    <ToastProvider>
      <OpsMobileStickyHeader
        selectedYmd="2026-08-23"
        onDateChange={() => undefined}
        onPrevDay={() => undefined}
        onNextDay={() => undefined}
        onToday={() => undefined}
        isViewingToday
        syncStatus="live"
        socketConnected
        activeWarehouse="TCS"
        onAddBooking={() => undefined}
        onOpenSheetImport={() => undefined}
        onNavigateCustomers={() => undefined}
        onOpenAirlineLabels={() => undefined}
        onDownloadDayExcel={() => undefined}
        onCopyCargoDayReport={() => undefined}
        filteredViewRows={rows}
        viewRows={rows}
        onWarehouseChange={() => undefined}
        searchHighlightWarehouses={[]}
        searchQuery=""
        onSearchChange={() => undefined}
        statusFilteredRows={rows}
        searchContext={emptySearch}
        onSelectSearchMatch={() => undefined}
        statusFilter="ALL"
        onStatusFilterChange={() => undefined}
        onClearFilters={() => undefined}
      />
    </ToastProvider>,
  );
}

describe("OpsMobileStickyHeader chrome", () => {
  it("card gọn: toolbar inline + chip kho, không overflow menu", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-sticky-header");
    expect(html).toContain("ops-mobile-top-row");
    expect(html).toContain("ops-mobile-identity-row");
    expect(html).toContain("ops-mobile-action-row");
    expect(html).toContain("ops-action-toolbar");
    expect(html).toContain("ops-context-strip");
    expect(html).toContain("ops-mobile-filter-row");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("Live");
    expect(html).toContain("OPS");
    expect(html).toContain("Khách");
    expect(html).toContain("Vantage");
    expect(html).not.toContain("Báo cáo &amp; Công cụ");
    expect(html).not.toContain("+ Booking");
    expect(html).not.toContain("ops-mobile-sync-bar");
  });

  it("vùng chạm ≥40px trên toolbar / chip kho / ngày / ST", () => {
    const html = renderHeader();
    expect(html).toContain("min-h-10");
    expect(html).toContain("Ngày trước");
    expect(html).toContain("Ngày sau");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("Lọc trạng thái");
  });

  it("ngày phiên overlay, không lộ locale input date", () => {
    const html = renderHeader();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("23-AUG-2026");
  });
});
