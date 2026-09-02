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
        onOpenSheetImport={() => undefined}
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
  it("header 2 tầng: ngày + Live + tìm kiếm; chip kho; toolbar overflow", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-sticky-header");
    expect(html).toContain("ops-mobile-top-row");
    expect(html).toContain("ops-mobile-wh-row");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("ops-mobile-toolbar");
    expect(html).toContain("ops-mobile-search-toggle");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("Live");
    expect(html).toContain("Thêm ▾");
    expect(html).not.toContain("ops-action-toolbar");
    expect(html).not.toContain("+ Booking");
  });

  it("vùng chạm ≥44px trên chip kho / ngày / toolbar", () => {
    const html = renderHeader();
    expect(html).toContain("min-h-11");
    expect(html).toContain("Ngày trước");
    expect(html).toContain("Ngày sau");
    expect(html).toContain("Lọc trạng thái");
  });

  it("ngày phiên overlay, không lộ locale input date", () => {
    const html = renderHeader();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("23-AUG-2026");
  });
});
