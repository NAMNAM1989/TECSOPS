import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatSyncedPhrase } from "../utils/dbSyncedAt";
import { SyncStatusPill, Wordmark } from "../ui";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { statusLabel, statusLabelCompact } from "./statusStyles";
import { OpsActionToolbar } from "./OpsActionToolbar";
import { OpsDatePicker } from "./OpsDatePicker";
import { OpsContextStrip } from "./OpsContextStrip";
import type { StatusFilterValue } from "./StatusFilterBar";

interface Props {
  selectedYmd: string;
  onDateChange: (ymd: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  lotSyncedAt?: number | null;
  pendingOfflineCount?: number;
  onSyncRefresh?: () => void | Promise<void>;
  syncRefreshing?: boolean;
  activeWarehouse: Warehouse;
  onAddBooking: (wh: Warehouse) => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  onCopyCargoDayReport?: (kind?: CargoDayReportCopyKind) => void;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  cargoReportCopying?: boolean;
  showDimScsc?: boolean;
  filteredViewRows: readonly Shipment[];
  viewRows: readonly Shipment[];
  onWarehouseChange: (wh: Warehouse) => void;
  searchHighlightWarehouses: readonly Warehouse[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  flightDateFilter?: string;
  onFlightDateChange?: (date: string) => void;
  statusFilteredRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  searchInputRef?: RefObject<HTMLInputElement>;
  onSelectSearchMatch: (match: ShipmentSearchMatch) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  onClearFilters: () => void;
}

/** Chrome mobile Ops — card gọn, FAB Booking ngoài header. */
export function OpsMobileStickyHeader({
  selectedYmd,
  onDateChange,
  onPrevDay,
  onNextDay,
  onToday,
  isViewingToday,
  syncStatus,
  socketConnected,
  lotSyncedAt = null,
  pendingOfflineCount = 0,
  onSyncRefresh,
  syncRefreshing = false,
  activeWarehouse,
  onAddBooking,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onNavigateCustomers,
  onPrefetchCustomers,
  onNavigateStats,
  onPrefetchStats,
  onOpenAirlineLabels,
  onDownloadDayExcel,
  onDownloadScscDim,
  onCopyCargoDayReport,
  excelExporting,
  scscDimExporting,
  cargoReportCopying,
  showDimScsc,
  filteredViewRows,
  viewRows,
  onWarehouseChange,
  searchHighlightWarehouses,
  searchQuery,
  onSearchChange,
  flightDateFilter = "",
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
    statusFilter !== "ALL" || searchQuery.trim().length > 0 || Boolean(flightDateFilter);
  const [statusExpanded, setStatusExpanded] = useState(false);

  useEffect(() => {
    if (statusFilter !== "ALL") setStatusExpanded(true);
  }, [statusFilter]);

  const showStatusBar = viewRows.length > 0 && (statusExpanded || statusFilter !== "ALL");

  const live = syncStatus === "live" && socketConnected;
  const syncTitle = useMemo(() => {
    const phrase = formatSyncedPhrase(lotSyncedAt);
    const pending = pendingOfflineCount > 0 ? `${pendingOfflineCount} chờ gửi` : "";
    return [phrase, pending].filter(Boolean).join(" · ");
  }, [lotSyncedAt, pendingOfflineCount]);

  const syncCta =
    !live && !syncRefreshing && onSyncRefresh
      ? syncStatus === "offline"
        ? "Thử lại"
        : "Làm mới"
      : null;

  return (
    <header className="space-y-0" data-testid="ops-mobile-sticky-header">
      <div className="space-y-1 rounded-2xl border border-ui-border/70 bg-ui-surface/95 p-1.5 shadow-ui-sm">
        <div
          data-testid="ops-mobile-top-row"
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden touch-pan-x"
        >
          <div
            data-testid="ops-mobile-identity-row"
            className="flex shrink-0 items-center gap-1"
          >
            <h1 className="m-0 shrink-0 leading-none">
              <Wordmark size="sm" />
            </h1>
            <span className="shrink-0 rounded-full bg-ui-navy px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-white">
              OPS
            </span>
            {syncCta ? (
              <button
                type="button"
                onClick={() => void onSyncRefresh?.()}
                className="inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1 rounded-full px-1"
                title={syncTitle || syncCta}
                aria-label={syncCta}
              >
                <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
                <span className="text-[10px] font-bold text-ui-navy">{syncCta}</span>
              </button>
            ) : (
              <span title={syncTitle || undefined} className="shrink-0">
                <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
              </span>
            )}
            <OpsDatePicker
              compact
              inline
              value={selectedYmd}
              onChange={onDateChange}
              onPrev={onPrevDay}
              onNext={onNextDay}
              onToday={onToday}
              isViewingToday={isViewingToday}
            />
          </div>

          <span className="h-7 w-px shrink-0 bg-ui-border/70" aria-hidden />

          <div data-testid="ops-mobile-action-row" className="shrink-0">
            <OpsActionToolbar
              variant="mobile"
              embedded
              activeWarehouse={activeWarehouse}
              onAddBooking={onAddBooking}
              includeBooking={false}
              includeSheet
              onOpenSheetImport={onOpenSheetImport}
              onPrefetchSheetImport={onPrefetchSheetImport}
              onNavigateStats={onNavigateStats}
              onPrefetchStats={onPrefetchStats}
              onNavigateCustomers={onNavigateCustomers}
              onPrefetchCustomers={onPrefetchCustomers}
              onOpenAirlineLabels={onOpenAirlineLabels}
              onDownloadDayExcel={onDownloadDayExcel}
              onDownloadScscDim={onDownloadScscDim}
              excelExporting={excelExporting}
              scscDimExporting={scscDimExporting}
              showDimScsc={showDimScsc}
              viewRows={viewRows}
              cargoReportCopying={cargoReportCopying}
              onCopyCargoDayReport={(kind) => onCopyCargoDayReport?.(kind)}
            />
          </div>
        </div>

        <OpsContextStrip
          variant="mobile"
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
          showMobileStatusBar={showStatusBar}
          onExpandMobileStatus={() => setStatusExpanded(true)}
          mobileStatusTrailing={
            showStatusBar ? (
              statusFilter === "ALL" ? (
                <button
                  type="button"
                  onClick={() => setStatusExpanded(false)}
                  className="inline-flex min-h-10 min-w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg text-[11px] font-semibold text-ui-text-muted"
                  aria-label="Thu gọn lọc trạng thái"
                >
                  ▲
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStatusFilterChange("ALL")}
                  className="inline-flex min-h-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-ui-navy/10 px-2 text-[10px] font-semibold text-ui-navy"
                >
                  {statusLabelCompact[statusFilter as keyof typeof statusLabelCompact] ??
                    statusLabel[statusFilter as keyof typeof statusLabel]}{" "}
                  ×
                </button>
              )
            ) : null
          }
        />
      </div>
    </header>
  );
}
