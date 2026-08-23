import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import type { Shipment } from "../types/shipment";

const emptySearch = {
  customers: [],
};

function renderHeader(portal: "tcs" | "scsc" | "none") {
  return renderToStaticMarkup(
    <OpsMobileStickyHeader
      selectedYmd="2026-08-23"
      onDateChange={() => undefined}
      onPrevDay={() => undefined}
      onNextDay={() => undefined}
      onToday={() => undefined}
      isViewingToday
      syncStatus="live"
      socketConnected
      activeWarehouse={portal === "scsc" ? "SCSC" : "TCS"}
      onAddBooking={() => undefined}
      onNavigateCustomers={() => undefined}
      onOpenAirlineLabels={() => undefined}
      onDownloadDayExcel={() => undefined}
      tcsPortalBar={portal === "tcs" ? <span>bar-tcs</span> : null}
      ecargoBar={portal === "scsc" ? <span>bar-scsc</span> : null}
      filteredViewRows={[] as Shipment[]}
      viewRows={[] as Shipment[]}
      onWarehouseChange={() => undefined}
      searchHighlightWarehouses={[]}
      searchQuery=""
      onSearchChange={() => undefined}
      statusFilteredRows={[] as Shipment[]}
      searchContext={emptySearch}
      onSelectSearchMatch={() => undefined}
      statusFilter="ALL"
      onStatusFilterChange={() => undefined}
      onClearFilters={() => undefined}
    />
  );
}

describe("OpsMobileStickyHeader portal slot", () => {
  it("cổng thu gọn: cần Ext trên PC — không CTA Đăng Nhập TCS giả", () => {
    const html = renderHeader("tcs");
    expect(html).toContain("Cổng TCS / ESID");
    expect(html).toContain("cần Ext trên PC");
    expect(html).not.toContain("Đăng Nhập TCS");
    expect(html).not.toContain("cần Đăng Nhập TCS");
  });

  it("eCargo thu gọn cũng báo cần Ext trên PC", () => {
    const html = renderHeader("scsc");
    expect(html).toContain("eCargo SCSC");
    expect(html).toContain("cần Ext trên PC");
    expect(html).not.toContain("Đăng Nhập TCS");
  });
});
