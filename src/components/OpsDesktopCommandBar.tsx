import type { RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import {
  SyncStatusPill,
  Wordmark,
} from "../ui";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { OpsActionToolbar } from "./OpsActionToolbar";
import { OpsDatePicker } from "./OpsDatePicker";
import { OpsContextStrip } from "./OpsContextStrip";
import type { StatusFilterValue } from "./StatusFilterBar";

type ToolsProps = {
  showDimScsc?: boolean;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
};

type Props = {
  selectedYmd: string;
  onDateChange: (ymd: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  daysWithData: number;
  totalLots: number;
  activeWarehouse: Warehouse;
  onAddBooking: (wh: Warehouse) => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  viewRows: readonly Shipment[];
  cargoReportCopying: boolean;
  onCopyCargoDayReport: (kind: CargoDayReportCopyKind) => void;
  toolsProps: ToolsProps;
  filteredViewRows: readonly Shipment[];
  onWarehouseChange: (wh: Warehouse) => void;
  searchHighlightWarehouses?: readonly Warehouse[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  flightDateFilter: string;
  onFlightDateChange: (date: string) => void;
  statusFilteredRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  searchInputRef?: RefObject<HTMLInputElement>;
  onSelectSearchMatch: (match: ShipmentSearchMatch) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  onClearFilters: () => void;
};

/** Chrome desktop Ops — card gọn: identity · thao tác · kho · lọc. */
export function OpsDesktopCommandBar({
  selectedYmd,
  onDateChange,
  onPrevDay,
  onNextDay,
  onToday,
  isViewingToday,
  syncStatus,
  socketConnected,
  daysWithData,
  totalLots,
  activeWarehouse,
  onAddBooking,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onNavigateStats,
  onPrefetchStats,
  viewRows,
  cargoReportCopying,
  onCopyCargoDayReport,
  toolsProps,
  filteredViewRows,
  onWarehouseChange,
  searchHighlightWarehouses = [],
  searchQuery,
  onSearchChange,
  flightDateFilter,
  onFlightDateChange,
  statusFilteredRows,
  searchContext,
  searchInputRef,
  onSelectSearchMatch,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
}: Props) {
  const filtersActive =
    statusFilter !== "ALL" || Boolean(searchQuery.trim()) || Boolean(flightDateFilter);

  return (
    <header
      className="overflow-hidden border-b border-ui-border bg-ui-surface"
      data-testid="ops-desktop-command-bar"
    >
      <div
        data-testid="ops-desktop-top-row"
        className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-5 py-3.5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
      >
          <div
            data-testid="ops-desktop-identity-row"
            className="flex shrink-0 items-center gap-1.5"
          >
            <h1 className="m-0 shrink-0 leading-none">
              <Wordmark size="sm" />
            </h1>
            <span className="shrink-0 rounded-full bg-ui-navy px-2 py-px text-[9px] font-bold uppercase tracking-wide text-white">
              OPS
            </span>
            <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
            {daysWithData > 0 ? (
              <span className="hidden shrink-0 text-[10px] text-ui-text-muted xl:inline">
                {totalLots}/{daysWithData}d
              </span>
            ) : null}
            <OpsDatePicker
              value={selectedYmd}
              onChange={onDateChange}
              onPrev={onPrevDay}
              onNext={onNextDay}
              onToday={onToday}
              isViewingToday={isViewingToday}
            />
            {!isViewingToday ? (
              <span
                className="shrink-0 rounded-full bg-ui-warning/15 px-2 py-0.5 text-[8px] font-bold uppercase text-ui-navy"
                title="Vẫn sửa / thêm lô được"
              >
                Ngày khác
              </span>
            ) : null}
          </div>

          <span className="h-7 w-px shrink-0 bg-ui-border/70" aria-hidden />

          <div data-testid="ops-desktop-command-actions" className="shrink-0">
            <OpsActionToolbar
              variant="desktop"
              embedded
              activeWarehouse={activeWarehouse}
              onAddBooking={onAddBooking}
              includeBooking
              includeSheet
              onOpenSheetImport={onOpenSheetImport}
              onPrefetchSheetImport={onPrefetchSheetImport}
              onNavigateStats={onNavigateStats}
              onPrefetchStats={onPrefetchStats}
              onCopyCargoDayReport={onCopyCargoDayReport}
              cargoReportCopying={cargoReportCopying}
              viewRows={viewRows}
              {...toolsProps}
            />
          </div>
        </div>

      <OpsContextStrip
        variant="desktop"
        selectedYmd={selectedYmd}
        filteredViewRows={filteredViewRows}
        viewRows={viewRows}
        activeWarehouse={activeWarehouse}
        onWarehouseChange={onWarehouseChange}
        searchHighlightWarehouses={searchHighlightWarehouses}
        filtersActive={filtersActive}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        flightDateFilter={flightDateFilter}
        onFlightDateChange={onFlightDateChange}
        statusFilteredRows={statusFilteredRows}
        searchContext={searchContext}
        searchInputRef={searchInputRef}
        onSelectSearchMatch={onSelectSearchMatch}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        onClearFilters={onClearFilters}
      />
    </header>
  );
}
