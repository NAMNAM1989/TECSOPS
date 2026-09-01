import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import type { Shipment } from "../types/shipment";
import { ToastProvider } from "../ui";
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
  it("Ngày → Kho → Summary một dòng; không KPI pill / không thanh Thêm", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-sticky-header");
    expect(html).toContain("ops-mobile-top-row");
    expect(html).toContain("h-11");
    expect(html).toContain("ops-mobile-wh-row");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain('data-label-only="true"');
    expect(html).toContain("ops-mobile-summary-row");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("Lô");
    expect(html).toContain("PCS");
    expect(html).toContain("KG");
    expect(html).toContain("ops-mobile-toolbar");
    expect(html).toContain("ops-mobile-filter-chip");
    expect(html).toContain("Tất cả");
    expect(html).toContain("ops-mobile-tools-overflow");
    expect(html).toContain("⋯");
    expect(html).toContain("ops-mobile-search-toggle");
    expect(html).toContain("ops-mobile-live-dot");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("Nay");
    expect(html).toContain("TECS-TCS");
    expect(html).toContain("TECS-SCSC");
    expect(html).not.toContain("Thêm ▾");
    expect(html).not.toContain("ops-action-toolbar");
    expect(html).not.toContain("+ Booking");
    expect(html).not.toContain("Kiện");
    expect(html).not.toContain("min-h-10 shrink-0 items-center gap-1.5 rounded-xl");
  });

  it("vùng chạm ≥44px trên ngày / kho / lọc / ⋯ / tìm", () => {
    const html = renderHeader();
    expect(html).toContain("min-h-11");
    expect(html).toContain("Ngày trước");
    expect(html).toContain("Ngày sau");
    expect(html).toContain("Lọc trạng thái");
    expect(html).toContain("Thêm thao tác");
  });

  it("ngày phiên overlay, không lộ locale input date", () => {
    const html = renderHeader();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("23-AUG-2026");
  });

  it("ngày trống: không summary, vẫn hàng kho cuộn", () => {
    const html = renderHeader({ empty: true });
    expect(html).toContain("ops-mobile-wh-row");
    expect(html).not.toContain("ops-mobile-summary-row");
    expect(html).not.toContain("ops-mobile-toolbar");
  });
});
