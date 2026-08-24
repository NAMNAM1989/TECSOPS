import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMobileStickyHeader } from "./OpsMobileStickyHeader";
import type { Shipment } from "../types/shipment";
import { ToastProvider } from "../ui";
import { blankShipmentDraft } from "../utils/blankShipment";

const emptySearch = {
  customers: [],
};

function renderHeader(opts: {
  portal?: "tcs" | "scsc" | "none";
  selected?: boolean;
  empty?: boolean;
}) {
  const portal = opts.portal ?? "none";
  const warehouse = portal === "scsc" ? "SCSC" : "TCS";
  const row = {
    ...blankShipmentDraft("2026-08-23", warehouse),
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
        activeWarehouse={warehouse}
        onAddBooking={() => undefined}
        onOpenSheetImport={() => undefined}
        onNavigateCustomers={() => undefined}
        onOpenAirlineLabels={() => undefined}
        onDownloadDayExcel={() => undefined}
        onCopyCargoDayReport={() => undefined}
        selectedShipment={opts.selected ? row : null}
        tcsPortalBar={portal === "tcs" ? <span>bar-tcs</span> : null}
        ecargoBar={portal === "scsc" ? <span>bar-scsc</span> : null}
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
  it("identity + lọc; DayPulse + chip kho; Booking không ở header; công cụ overflow", () => {
    const html = renderHeader({ portal: "tcs" });
    expect(html).toContain("ops-mobile-sticky-header");
    expect(html).toContain("ops-mobile-identity-row");
    expect(html).toContain("ops-mobile-filter-row");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("ops-day-pulse");
    expect(html).toContain("Tổng ngày");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("Live");
    expect(html).toContain("OPS");
    expect(html).toContain("Báo cáo, Tải Ext, Công cụ");
    expect(html).not.toContain("+ Booking");
    expect(html).not.toContain("ops-mobile-sync-bar");
    expect(html).not.toContain("Chọn kho</span>");
    expect(html).not.toContain("bg-emerald-600");
    expect(html).not.toContain("Vantage");
  });

  it("vùng chạm sticky ≥44px trên overflow / chip kho / ngày / ST", () => {
    const html = renderHeader({});
    expect(html).toContain("min-h-11");
    expect(html).toContain("Ngày trước");
    expect(html).toContain("Ngày sau");
    expect(html).toContain("warehouse-chips");
    expect(html).toContain("Lọc trạng thái");
  });

  it("portal ẩn khi chưa chọn lô — không CTA Đăng Nhập TCS giả", () => {
    const html = renderHeader({ portal: "tcs", selected: false });
    expect(html).not.toContain("ops-mobile-portal-slot");
    expect(html).not.toContain("bar-tcs");
    expect(html).not.toContain("Cổng TCS / ESID");
    expect(html).not.toContain("Đăng Nhập TCS");
    expect(html).not.toContain("cần Đăng Nhập TCS");
  });

  it("TCS + lô chọn: hiện cổng, vẫn không CTA Đăng Nhập TCS giả", () => {
    const html = renderHeader({ portal: "tcs", selected: true });
    expect(html).toContain("ops-mobile-portal-slot");
    expect(html).toContain("bar-tcs");
    expect(html).not.toContain("Đăng Nhập TCS");
  });

  it("SCSC + lô chọn: hiện eCargo, không Đăng Nhập TCS", () => {
    const html = renderHeader({ portal: "scsc", selected: true });
    expect(html).toContain("bar-scsc");
    expect(html).not.toContain("Đăng Nhập TCS");
  });

  it("ngày phiên overlay, không lộ locale input date", () => {
    const html = renderHeader({});
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).toContain("23-AUG-2026");
  });
});
