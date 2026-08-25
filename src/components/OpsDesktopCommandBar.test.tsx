import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { ToastProvider } from "../ui";
import { blankShipmentDraft } from "../utils/blankShipment";
import { OpsDesktopCommandBar } from "./OpsDesktopCommandBar";

const row = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  pcs: 2,
  kg: 10,
} as Shipment;

function renderBar() {
  return renderToStaticMarkup(
    <ToastProvider>
      <OpsDesktopCommandBar
        selectedYmd="2026-08-23"
        onDateChange={() => undefined}
        onPrevDay={() => undefined}
        onNextDay={() => undefined}
        onToday={() => undefined}
        isViewingToday
        syncStatus="live"
        socketConnected
        daysWithData={1}
        totalLots={1}
        activeWarehouse="TCS"
        onAddBooking={() => undefined}
        onOpenSheetImport={() => undefined}
        onNavigateStats={() => undefined}
        viewRows={[row]}
        cargoReportCopying={false}
        onCopyCargoDayReport={() => undefined}
        toolsProps={{
          onNavigateCustomers: () => undefined,
          onOpenAirlineLabels: () => undefined,
          onDownloadDayExcel: () => undefined,
        }}
        filteredViewRows={[row]}
        onWarehouseChange={() => undefined}
        searchQuery=""
        onSearchChange={() => undefined}
        flightDateFilter=""
        onFlightDateChange={() => undefined}
        statusFilteredRows={[row]}
        searchContext={{ customers: [] }}
        onSelectSearchMatch={() => undefined}
        statusFilter="ALL"
        onStatusFilterChange={() => undefined}
        onClearFilters={() => undefined}
      />
    </ToastProvider>,
  );
}

describe("OpsDesktopCommandBar", () => {
  it("Booking/Search ngoài menu; DayPulse + 4 kho; Ảnh báo cáo là nút toolbar", () => {
    const html = renderBar();
    expect(html).toContain("ops-desktop-command-bar");
    expect(html).toContain("+ Booking");
    expect(html).toContain("Thống kê");
    expect(html).toContain("ops-cargo-report-toolbar");
    expect(html).toContain("Vantage");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("ops-day-pulse");
    expect(html).toContain("Tổng ngày");
    expect(html).toContain('aria-label="Chọn kho"');
    expect(html).toContain("TECS-TCS");
    expect(html).toContain("SCSC");
    const actions = html.match(
      /data-testid="ops-desktop-command-actions"[\s\S]*?(?=data-testid="ops-cargo-report-toolbar"|$)/,
    )?.[0] ?? "";
    expect(actions).toContain("+ Booking");
    expect(actions).toContain("Nhập Sheet");
    expect(actions).not.toContain("bg-emerald-600");
    expect(actions).not.toContain("Vantage");
    expect(html).not.toContain(">Báo cáo</span>");
  });

  it("không lộ format ngày locale của input type=date", () => {
    const html = renderBar();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).not.toContain("23-AUG-2026</option>");
  });

  it("không clip OverflowMenu: overflow-x-auto chỉ ở cụm identity, không bọc Ext/Công cụ", () => {
    const html = renderBar();
    const rowOpen = html.match(/data-testid="ops-desktop-command-row"[^>]*>/)?.[0] ?? "";
    const actionsOpen = html.match(/data-testid="ops-desktop-command-actions"[^>]*>/)?.[0] ?? "";
    expect(rowOpen).toContain("overflow-visible");
    expect(rowOpen).not.toContain("overflow-x-auto");
    expect(actionsOpen).toContain("overflow-visible");
    expect(actionsOpen).not.toContain("overflow-x-auto");
    expect(html).toContain("Ảnh báo cáo lô hàng");
    expect(html).toContain("Tải Ext");
    expect(html).toContain("Công cụ");
  });
});
