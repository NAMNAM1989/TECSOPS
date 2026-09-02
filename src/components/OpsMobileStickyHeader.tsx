import { useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatSyncedPhrase } from "../utils/dbSyncedAt";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeOpsDayOverview } from "../utils/opsDayOverview";
import { SyncStatusPill } from "../ui";
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
  onDownloadDayExcel: () => void;
  onCopyCargoDayReport?: (kind?: CargoDayReportCopyKind) => void;
  excelExporting?: boolean;
  cargoReportCopying?: boolean;
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

/** Chrome mobile Ops — header 2 tầng, KPI scroll, toolbar lọc + overflow. */
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
  onDownloadDayExcel,
  onCopyCargoDayReport,
  excelExporting,
  cargoReportCopying,
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
    <header className="space-y-0" data-testid="ops-mobile-sticky-header">
      <div className="overflow-hidden rounded-none border-b border-ui-border/80 bg-ui-background">
        <div
          data-testid="ops-mobile-top-row"
          className="flex min-h-[52px] items-center gap-2 px-3 py-2"
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
          {syncCta ? (
            <button
              type="button"
              onClick={() => void onSyncRefresh?.()}
              className="inline-flex min-h-10 shrink-0 touch-manipulation items-center gap-1 rounded-full px-1"
              title={syncTitle || syncCta}
              aria-label={syncCta}
            >
              <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
              <span className="text-[10px] font-bold text-ui-navy">{syncCta}</span>
            </button>
          ) : (
            <span title={syncTitle || "Live sync"} className="inline-flex shrink-0 items-center gap-1">
              <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
              <span className="text-[11px] font-bold text-emerald-700">Live</span>
            </span>
          )}
          <button
            type="button"
            data-testid="ops-mobile-search-toggle"
            onClick={() => setSearchExpanded((v) => !v)}
            className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-ui-border/80 bg-ui-surface text-ui-text shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
            aria-label={searchExpanded ? "Đóng tìm kiếm" : "Mở tìm kiếm"}
            aria-expanded={searchExpanded}
          >
            <SearchIcon />
          </button>
        </div>

        {searchExpanded ? (
          <div
            data-testid="ops-mobile-search-expand"
            className="border-t border-ui-border/60 px-3 py-2"
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
                className="mt-1.5 text-[11px] font-semibold text-ui-primary"
              >
                Xóa bộ lọc
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          data-testid="ops-mobile-wh-row"
          className="flex gap-1.5 overflow-x-auto overscroll-x-contain border-t border-ui-border/60 px-3 py-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          <div data-testid="warehouse-chips" className="min-w-0 shrink-0">
            <WarehouseGridPicker
              rows={viewRows}
              active={activeWarehouse}
              onSelect={onWarehouseChange}
              highlightWarehouses={searchHighlightWarehouses}
              chips
              denseChips
              touchTargets
              hideAddButton
            />
          </div>
        </div>

        {viewRows.length > 0 ? (
          <div
            data-testid="ops-day-overview"
            className="flex gap-2 overflow-x-auto overscroll-x-contain border-t border-ui-border/60 px-3 py-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          >
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-ui-border/80 bg-ui-surface px-3 shadow-ui-sm">
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-ui-text-muted">
                Lô{filterHint}
              </span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-ui-navy">
                {totals.lots}
              </span>
            </span>
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-ui-border/80 bg-ui-surface px-3 shadow-ui-sm">
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-ui-text-muted">
                PCS
              </span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-ui-navy">
                {totals.pcs}
              </span>
            </span>
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-ui-border/80 bg-ui-surface px-3 shadow-ui-sm">
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-ui-text-muted">
                KG
              </span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-ui-navy">
                {kgLabel}
              </span>
            </span>
          </div>
        ) : null}

        <OpsMobileToolbar
          activeWarehouse={activeWarehouse}
          viewRows={viewRows}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          onOpenSheetImport={onOpenSheetImport}
          onPrefetchSheetImport={onPrefetchSheetImport}
          onDownloadDayExcel={onDownloadDayExcel}
          excelExporting={excelExporting}
          cargoReportCopying={cargoReportCopying}
          onCopyCargoDayReport={(kind) => onCopyCargoDayReport?.(kind)}
        />
      </div>
    </header>
  );
}
