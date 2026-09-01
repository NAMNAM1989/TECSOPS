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
  it("một hàng top: identity + toolbar embedded, chip kho", () => {
    const html = renderBar();
    expect(html).toContain("ops-desktop-command-bar");
    expect(html).toContain("ops-desktop-top-row");
    expect(html).toContain("ops-action-toolbar");
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('aria-label="+ Booking TCS"');
    expect(html).toContain("Nhập Sheet");
    expect(html).toContain("Thống kê");
    expect(html).toContain("Vantage");
    expect(html).toContain("23-AUG-2026");
    expect(html).toContain("ops-day-overview");
    expect(html).toContain("PCS");
    expect(html).not.toContain("OverflowMenu");
  });

  it("không lộ format ngày locale của input type=date", () => {
    const html = renderBar();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
  });

  it("top row cuộn ngang một lần", () => {
    const html = renderBar();
    const top = html.match(/data-testid="ops-desktop-top-row"[^>]*>/)?.[0] ?? "";
    expect(top).toContain("overflow-x-auto");
    expect(html).toContain("Ảnh báo cáo lô hàng");
  });
});
