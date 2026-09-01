import { useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatSyncedPhrase } from "../utils/dbSyncedAt";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeOpsDayOverview } from "../utils/opsDayOverview";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { OpsDatePicker } from "./OpsDatePicker";
import { SmartSearchBar } from "./SmartSearchBar";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import type { StatusFilterValue } from "./StatusFilterBar";
import { OpsMobileToolbar } from "./OpsMobileToolbar";

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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function LiveDot({
  live,
  title,
  cta,
  onRefresh,
}: {
  live: boolean;
  title: string;
  cta: string | null;
  onRefresh?: () => void;
}) {
  const tone = live
    ? "bg-emerald-500"
    : cta
      ? "bg-amber-400"
      : "bg-slate-400";
  return (
    <button
      type="button"
      data-testid="ops-mobile-live-dot"
      disabled={!cta}
      onClick={() => {
        if (cta) onRefresh?.();
      }}
      title={title || (live ? "Live" : cta ?? "Đồng bộ")}
      aria-label={cta ?? (live ? "Live" : "Đồng bộ")}
      className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:cursor-default"
    >
      <span
        className={`h-2 w-2 rounded-full ${tone} ${live ? "animate-pulse" : ""}`}
        aria-hidden
      />
    </button>
  );
}

/** Chrome mobile Ops — Ngày (44) → Kho (44) → Summary (28) + 1 CTA list. */
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
  const [searchExpanded, setSearchExpanded] = useState(
    () => searchQuery.trim().length > 0 || Boolean(flightDateFilter),
  );

  const filtersActive =
    statusFilter !== "ALL" || searchQuery.trim().length > 0 || Boolean(flightDateFilter);

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

  const { totals } = useMemo(() => computeOpsDayOverview(filteredViewRows), [filteredViewRows]);
  const kgLabel = formatKgTotal(totals.kg);
  const filterHint = filtersActive ? "*" : "";

  return (
    <header className="space-y-0 bg-ui-surface" data-testid="ops-mobile-sticky-header">
      <div className="border-b border-ui-border bg-ui-surface">
        <div
          data-testid="ops-mobile-top-row"
          className="flex h-11 items-center gap-1 px-2"
        >
          <div className="min-w-0 flex-1">
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
          <LiveDot
            live={live}
            title={syncTitle || (live ? "Live" : syncCta ?? "Đồng bộ")}
            cta={syncCta}
            onRefresh={() => void onSyncRefresh?.()}
          />
          <button
            type="button"
            data-testid="ops-mobile-search-toggle"
            onClick={() => setSearchExpanded((v) => !v)}
            className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-ui-md text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
            aria-label={searchExpanded ? "Đóng tìm kiếm" : "Mở tìm kiếm"}
            aria-expanded={searchExpanded}
          >
            <SearchIcon />
          </button>
        </div>

        {searchExpanded ? (
          <div
            data-testid="ops-mobile-search-expand"
            className="border-t border-ui-border px-3 py-2"
          >
            <SmartSearchBar
              compact
              tightFacets
              value={searchQuery}
              onChange={onSearchChange}
              flightDateFilter={flightDateFilter}
              onFlightDateChange={onFlightDateChange}
              searchableRows={statusFilteredRows}
              matchedRows={filteredViewRows}
              searchContext={searchContext}
              inputRef={searchInputRef}
              onSelectMatch={onSelectSearchMatch}
              inlineFacets={false}
              debounceMs={200}
            />
            {filtersActive ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="mt-1.5 min-h-11 text-[13px] font-semibold text-ui-primary"
              >
                Xóa bộ lọc
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          data-testid="ops-mobile-wh-row"
          className="h-11 overflow-x-auto overscroll-x-contain border-t border-ui-border [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          <WarehouseGridPicker
            rows={viewRows}
            active={activeWarehouse}
            onSelect={onWarehouseChange}
            highlightWarehouses={searchHighlightWarehouses}
            chips
            labelOnly
            touchTargets
            hideAddButton
            className="h-11 min-w-max px-3"
          />
        </div>

        {viewRows.length > 0 ? (
          <div
            data-testid="ops-mobile-summary-row"
            className="flex h-7 items-center gap-2 overflow-visible border-t border-ui-border px-3"
          >
            <p
              data-testid="ops-day-overview"
              className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px] text-ui-text-muted"
              title={`Lô${filterHint} · PCS · KG`}
            >
              Lô{filterHint} {totals.lots}
              <span className="mx-1 text-ui-border">·</span>
              PCS {totals.pcs}
              <span className="mx-1 text-ui-border">·</span>
              KG {kgLabel}
            </p>
            <div className="-my-2">
              <OpsMobileToolbar
                activeWarehouse={activeWarehouse}
                viewRows={viewRows}
                statusFilter={statusFilter}
                onStatusFilterChange={onStatusFilterChange}
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
                cargoReportCopying={cargoReportCopying}
                onCopyCargoDayReport={(kind) => onCopyCargoDayReport?.(kind)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
