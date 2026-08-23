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
        totalPcs={2}
        totalKg={10}
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
  it("chrome 2 hàng: Booking là CTA chính, báo cáo trong overflow", () => {
    const html = renderBar();
    expect(html).toContain("ops-desktop-command-bar");
    expect(html).toContain("+ Booking");
    expect(html).toContain("Thống kê");
    expect(html).toContain("Báo cáo");
    expect(html).toContain("23-AUG-2026");
    expect(html).not.toContain("bg-emerald-600");
    expect(html).not.toContain("bg-sky-600");
    expect(html).not.toContain("bg-violet-600");
  });

  it("không lộ format ngày locale của input type=date", () => {
    const html = renderBar();
    expect(html).toContain('type="date"');
    expect(html).toContain("opacity-0");
    expect(html).not.toContain("23-AUG-2026</option>");
  });

  it("không clip OverflowMenu: overflow-x-auto chỉ ở cụm identity, không bọc Báo cáo/Ext/Công cụ", () => {
    const html = renderBar();
    const rowOpen = html.match(/data-testid="ops-desktop-command-row"[^>]*>/)?.[0] ?? "";
    const actionsOpen = html.match(/data-testid="ops-desktop-command-actions"[^>]*>/)?.[0] ?? "";
    expect(rowOpen).toContain("overflow-visible");
    expect(rowOpen).not.toContain("overflow-x-auto");
    expect(actionsOpen).toContain("overflow-visible");
    expect(actionsOpen).not.toContain("overflow-x-auto");
    expect(html).toContain("Báo cáo");
    expect(html).toContain("Tải Ext");
    expect(html).toContain("Công cụ");
  });
});
