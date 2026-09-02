import { useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatSyncedPhrase } from "../utils/dbSyncedAt";
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
      width={16}
      height={16}
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

/** Chrome mobile Ops — ngày · chip kho; tìm/lọc/thao tác trong panel 🔍. */
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
  const [toolsExpanded, setToolsExpanded] = useState(
    () =>
      searchQuery.trim().length > 0 ||
      Boolean(flightDateFilter) ||
      statusFilter !== "ALL",
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

  return (
    <header className="space-y-0" data-testid="ops-mobile-sticky-header">
      <div className="overflow-hidden rounded-none border-b border-ui-border/80 bg-ui-background">
        <div
          data-testid="ops-mobile-top-row"
          className="flex h-9 items-center gap-1 px-2 py-0"
        >
          <div className="min-w-0 shrink-0">
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
          <div className="min-w-0 flex-1" aria-hidden />
          {syncCta ? (
            <button
              type="button"
              onClick={() => void onSyncRefresh?.()}
              className="inline-flex h-8 shrink-0 touch-manipulation items-center gap-1 rounded-full px-0.5"
              title={syncTitle || syncCta}
              aria-label={syncCta}
            >
              <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
              <span className="text-[9px] font-bold text-ui-navy">{syncCta}</span>
            </button>
          ) : (
            <span title={syncTitle || "Live sync"} className="inline-flex shrink-0 scale-90 origin-right">
              <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
            </span>
          )}
          <button
            type="button"
            data-testid="ops-mobile-search-toggle"
            onClick={() => setToolsExpanded((v) => !v)}
            className={`relative inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg border text-ui-text transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
              toolsExpanded || filtersActive
                ? "border-ui-primary/50 bg-ui-primary/10 text-ui-primary"
                : "border-ui-border/70 bg-ui-surface hover:bg-ui-surface-muted"
            }`}
            aria-label={toolsExpanded ? "Đóng tìm & lọc" : "Tìm kiếm, lọc & thao tác"}
            aria-expanded={toolsExpanded}
            title="Tìm · lọc trạng thái · Sync / Excel"
          >
            <SearchIcon />
            {filtersActive && !toolsExpanded ? (
              <span
                className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-ui-primary"
                aria-hidden
              />
            ) : null}
          </button>
        </div>

        {toolsExpanded ? (
          <div
            data-testid="ops-mobile-search-expand"
            className="border-t border-ui-border/60 px-2 py-1.5"
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
            <OpsMobileToolbar
              embedded
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
          className="border-t border-ui-border/60 px-2 py-1"
        >
          <WarehouseGridPicker
            rows={viewRows}
            active={activeWarehouse}
            onSelect={onWarehouseChange}
            highlightWarehouses={searchHighlightWarehouses}
            chips
            denseChips
            fitRow
            hideAddButton
            className="w-full"
          />
        </div>
      </div>
    </header>
  );
}
