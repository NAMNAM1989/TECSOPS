import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatSyncedPhrase } from "../utils/dbSyncedAt";
import { Button, SyncStatusPill, Wordmark } from "../ui";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { OpsCargoReportToolbar } from "./OpsCargoReportToolbar";
import { statusLabel, statusLabelCompact } from "./statusStyles";
import { EsidSettingsMenu } from "./EsidSettingsMenu";
import { OpsDatePicker } from "./OpsDatePicker";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import type { SyncStatus } from "../hooks/useShipmentSync";
import { OpsDayOverviewStrip } from "./OpsDayOverviewStrip";

interface Props {
  selectedYmd: string;
  onDateChange: (ymd: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  syncStatus: SyncStatus;
  socketConnected: boolean;
  /** SoT lots.synced_at — không dùng lastSyncAt client / customers. */
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

/**
 * Chrome mobile Ops: identity + DayPulse/chip kho + ảnh báo cáo + lọc.
 * + Booking là FAB ngoài header. Công cụ / ESID trong ⋯.
 */
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
  onAddBooking: _onAddBooking,
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

  const toolItems = useMemo((): OverflowMenuItem[] => {
    const list: OverflowMenuItem[] = [
      {
        id: "sheet-import",
        label: "Nhập Sheet",
        description: "Google Sheet BOOK HẰNG NGÀY",
        onSelect: onOpenSheetImport,
        onPrefetch: onPrefetchSheetImport,
      },
    ];
    if (onNavigateStats) {
      list.push({
        id: "stats",
        label: "Thống kê",
        description: "Công cụ · Lô · Kg · DIM · Chargeable",
        onSelect: onNavigateStats,
        onPrefetch: onPrefetchStats,
      });
    }
    list.push(
      {
        id: "customers",
        label: "Khách",
        description: "Công cụ · danh bạ & hồ sơ in",
        onSelect: onNavigateCustomers,
        onPrefetch: onPrefetchCustomers,
      },
      {
        id: "airline",
        label: "Tên hãng",
        description: "Công cụ · tên in trên tem",
        onSelect: onOpenAirlineLabels,
      },
      {
        id: "excel",
        label: excelExporting ? "Đang xuất Excel…" : "Xuất Excel…",
        description: "Công cụ · ngày hoặc khoảng ngày",
        onSelect: onDownloadDayExcel,
        disabled: excelExporting,
      },
    );
    if (showDimScsc && onDownloadScscDim) {
      list.push({
        id: "dim-scsc",
        label: scscDimExporting ? "Đang xuất DIM…" : "Xuất LIST DIM SCSC (ngày)",
        description: "Công cụ · Excel LIST DIM theo ngày phiên",
        onSelect: onDownloadScscDim,
        disabled: scscDimExporting,
      });
    }
    return list;
  }, [
    excelExporting,
    onDownloadDayExcel,
    onDownloadScscDim,
    onNavigateCustomers,
    onNavigateStats,
    onOpenAirlineLabels,
    onOpenSheetImport,
    onPrefetchCustomers,
    onPrefetchSheetImport,
    onPrefetchStats,
    scscDimExporting,
    showDimScsc,
  ]);

  const overflowItems = toolItems;

  const syncCta =
    !live && !syncRefreshing && onSyncRefresh
      ? syncStatus === "offline"
        ? "Thử lại"
        : "Làm mới"
      : null;

  return (
    <header className="space-y-1" data-testid="ops-mobile-sticky-header">
      <div
        data-testid="ops-mobile-identity-row"
        className="flex min-w-0 items-center gap-1 overflow-visible"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <h1 className="m-0 shrink-0 leading-none">
            <Wordmark size="sm" />
          </h1>
          <span className="shrink-0 rounded-full bg-ui-navy px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-white shadow-ui-sm">
            OPS
          </span>
          {syncCta ? (
            <button
              type="button"
              onClick={() => void onSyncRefresh?.()}
              className="inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-1 rounded-full px-1"
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

        <div className="flex shrink-0 items-center gap-1 overflow-visible" data-testid="ops-mobile-overflow">
          <EsidSettingsMenu compact />
          <OverflowMenu
            compact
            align="right"
            label="Công cụ"
            items={overflowItems}
          />
        </div>
      </div>

      <OpsDayOverviewStrip
        variant="mobile"
        selectedYmd={selectedYmd}
        rows={filteredViewRows}
        activeWarehouse={activeWarehouse}
        onSelectWarehouse={onWarehouseChange}
        highlightWarehouses={searchHighlightWarehouses}
        filtersActive={filtersActive}
      />

      {onCopyCargoDayReport ? (
        <OpsCargoReportToolbar
          variant="mobile"
          viewRows={viewRows}
          copying={cargoReportCopying}
          onCopy={onCopyCargoDayReport}
        />
      ) : null}

      <div
        data-testid="ops-mobile-filter-row"
        className="flex min-w-0 items-center gap-1.5"
      >
        {viewRows.length > 0 ? (
          <div className="min-w-0 flex-1">
            <SmartSearchBar
              compact
              value={searchQuery}
              onChange={onSearchChange}
              flightDateFilter={flightDateFilter}
              onFlightDateChange={onFlightDateChange}
              searchableRows={statusFilteredRows}
              matchedRows={filteredViewRows}
              searchContext={searchContext}
              inputRef={searchInputRef}
              onSelectMatch={onSelectSearchMatch}
            />
          </div>
        ) : (
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ui-text-muted">
            Chưa có lô · + Booking
          </p>
        )}

        {viewRows.length > 0 && !showStatusBar ? (
          <button
            type="button"
            onClick={() => setStatusExpanded(true)}
            className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-2 text-[11px] font-bold text-ui-text-muted"
            aria-label="Lọc trạng thái"
            title="Lọc trạng thái"
          >
            ST
          </button>
        ) : null}
        {filtersActive ? (
          <Button
            variant="ghost"
            size="md"
            onClick={onClearFilters}
            className="min-h-11 shrink-0 px-2 text-[11px] font-bold text-ui-primary"
          >
            Xóa
          </Button>
        ) : null}
      </div>

      {showStatusBar ? (
        <div className="flex min-w-0 items-center gap-1">
          <StatusFilterBar
            compact
            dense
            hideEmpty
            warehouse={activeWarehouse}
            dayRows={viewRows}
            value={statusFilter}
            onChange={onStatusFilterChange}
          />
          {statusFilter === "ALL" ? (
            <button
              type="button"
              onClick={() => setStatusExpanded(false)}
              className="inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-[11px] font-semibold text-ui-text-muted"
              aria-label="Thu gọn lọc trạng thái"
            >
              ▲
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStatusFilterChange("ALL")}
              className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-ui-navy/10 px-2 text-[10px] font-semibold text-ui-navy"
            >
              {statusLabelCompact[statusFilter as keyof typeof statusLabelCompact] ??
                statusLabel[statusFilter as keyof typeof statusLabel]}{" "}
              ×
            </button>
          )}
        </div>
      ) : null}
    </header>
  );
}
