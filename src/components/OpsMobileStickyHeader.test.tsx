import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import type { Shipment } from "../types/shipment";
import { ToastProvider } from "../ui";
import { blankShipmentDraft } from "../utils/blankShipment";

const emptySearch = {
  customers: [],
};

function renderHeader(opts: { empty?: boolean; expandTools?: boolean } = {}) {
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
        searchQuery={opts.expandTools ? "176" : ""}
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
  it("header gọn: ngày + chip kho; toolbar gộp trong 🔍 (mặc định đóng)", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-sticky-header");
    expect(html).toContain("ops-mobile-top-row");
    expect(html).toContain("ops-mobile-wh-row");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("ops-mobile-search-toggle");
    expect(html).toContain("Tìm kiếm, lọc");
    expect(html).toContain("thao tác");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("Live");
    expect(html).not.toContain("ops-mobile-toolbar");
    expect(html).not.toContain("ops-mobile-search-expand");
    expect(html).not.toContain("ops-day-overview");
    expect(html).not.toContain("ops-action-toolbar");
    expect(html).not.toContain("+ Booking");
  });

  it("mở 🔍: hiện tìm + lọc status + Thêm (embedded)", () => {
    const html = renderHeader({ expandTools: true });
    expect(html).toContain("ops-mobile-search-expand");
    expect(html).toContain("ops-mobile-toolbar");
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain("Lọc trạng thái");
    expect(html).toContain("Thêm ▾");
    expect(html).toContain("Xóa bộ lọc");
  });

  it("top row: tổng ngày tất cả kho giữa ngày và Live", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-day-totals");
    expect(html).toContain("Tổng ngày");
    expect(html).toContain(">Lô<");
    expect(html).toContain(">Kg<");
    expect(html).not.toContain(">Kiện<");
    expect(html).toContain("1");
    expect(html).toContain("10");
    expect(html).toContain("Tất cả kho");
  });

  it("top row dense h-9; 4 kho fitRow cố định", () => {
    const html = renderHeader();
    expect(html).toContain("ops-mobile-top-row");
    expect(html).toContain("h-9 items-center");
    expect(html).toContain("h-8 w-8");
    expect(html).toContain("grid-cols-4");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("Ngày trước");
    expect(html).toContain("Ngày sau");
  });

  it("ngày phiên overlay, không lộ locale input date", () => {
    const html = renderHeader();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("23-AUG-2026");
  });
});
