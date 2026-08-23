import type { ReactNode, RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import {
  Button,
  SyncStatusPill,
  Wordmark,
} from "../ui";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { ChromeExtensionsDownloadMenu } from "./ChromeExtensionsDownloadMenu";
import { NewBookingButton } from "./NewBookingButton";
import { OpsCargoReportMenu } from "./OpsCargoReportMenu";
import { OpsDatePicker } from "./OpsDatePicker";
import { OpsDayOverviewStrip } from "./OpsDayOverviewStrip";
import { OpsToolsMenu } from "./OpsToolsMenu";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";

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
  tcsPortalBar?: ReactNode;
  ecargoBar?: ReactNode;
};

/** Chrome desktop Ops: lệnh + DayPulse/kho + lọc. Booking/Search ngoài menu. */
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
  tcsPortalBar,
  ecargoBar,
}: Props) {
  const filtersActive =
    statusFilter !== "ALL" || Boolean(searchQuery.trim()) || Boolean(flightDateFilter);

  return (
    <header className="space-y-1" data-testid="ops-desktop-command-bar">
      <div
        data-testid="ops-desktop-command-row"
        className="flex min-w-0 items-center gap-x-2 overflow-visible"
      >
        <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <h1 className="m-0 leading-none">
              <Wordmark size="sm" />
            </h1>
            <span className="rounded-full bg-ui-navy px-2 py-px text-[9px] font-bold uppercase tracking-wide text-white shadow-ui-sm">
              OPS
            </span>
            <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
            {daysWithData > 0 ? (
              <span className="hidden text-[10px] text-ui-text-muted lg:inline">
                {totalLots}/{daysWithData}d
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-1">
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
                className="rounded bg-ui-warning/15 px-1.5 py-px text-[8px] font-bold uppercase text-ui-navy"
                title="Vẫn sửa / thêm lô được"
              >
                Ngày khác
              </span>
            ) : null}
          </div>
        </div>

        <div
          data-testid="ops-desktop-command-actions"
          className="flex shrink-0 items-center justify-end gap-1.5 overflow-visible"
        >
          <NewBookingButton activeWarehouse={activeWarehouse} onAdd={onAddBooking} />
          {onNavigateStats ? (
            <Button
              variant="secondary"
              size="sm"
              title="Thống kê Lô · Kg · DIM · Chargeable"
              onClick={onNavigateStats}
              onMouseEnter={onPrefetchStats}
              onFocus={onPrefetchStats}
            >
              Thống kê
            </Button>
          ) : null}
          <OpsCargoReportMenu
            viewRows={viewRows}
            copying={cargoReportCopying}
            onCopy={onCopyCargoDayReport}
          />
          <ChromeExtensionsDownloadMenu />
          <OpsToolsMenu {...toolsProps} />
        </div>
      </div>

      <OpsDayOverviewStrip
        variant="desktop"
        selectedYmd={selectedYmd}
        rows={filteredViewRows}
        activeWarehouse={activeWarehouse}
        onSelectWarehouse={onWarehouseChange}
        highlightWarehouses={searchHighlightWarehouses}
        filtersActive={filtersActive}
      />

      {viewRows.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <SmartSearchBar
            value={searchQuery}
            onChange={onSearchChange}
            flightDateFilter={flightDateFilter}
            onFlightDateChange={onFlightDateChange}
            searchableRows={statusFilteredRows}
            matchedRows={filteredViewRows}
            searchContext={searchContext}
            inputRef={searchInputRef}
            onSelectMatch={onSelectSearchMatch}
            inlineFacets
          />
          <StatusFilterBar
            compact
            dense
            hideEmpty
            warehouse={activeWarehouse}
            dayRows={viewRows}
            value={statusFilter}
            onChange={onStatusFilterChange}
          />
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="shrink-0 px-1.5 text-[10px] text-ui-primary hover:bg-ui-primary/10"
            >
              Xóa
            </Button>
          ) : null}
          {tcsPortalBar ? <div className="min-w-0 shrink-0">{tcsPortalBar}</div> : null}
          {ecargoBar ? <div className="min-w-0 shrink-0">{ecargoBar}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
