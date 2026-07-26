import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatKgTotal } from "../utils/formatKgTotal";
import { KpiStat, SyncStatusPill, Wordmark } from "../ui";
import { statusLabel } from "./statusStyles";
import { OpsDatePicker } from "./OpsDatePicker";
import { NewBookingButton } from "./NewBookingButton";
import { OpsToolsMenu } from "./OpsToolsMenu";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import type { ReactNode } from "react";

interface Props {
  selectedYmd: string;
  onDateChange: (ymd: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  syncStatus: "live" | "degraded" | "offline";
  socketConnected: boolean;
  activeWarehouse: Warehouse;
  onAddBooking: (wh: Warehouse) => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  showDimScsc?: boolean;
  /** Thanh Cổng TCS dưới ô tìm kiếm (TECS-TCS) */
  tcsPortalBar?: ReactNode;
  filteredViewRows: readonly Shipment[];
  viewRows: readonly Shipment[];
  onWarehouseChange: (wh: Warehouse) => void;
  searchHighlightWarehouses: readonly Warehouse[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilteredRows: readonly Shipment[];
  searchContext: ShipmentSearchContext;
  searchInputRef?: RefObject<HTMLInputElement>;
  onSelectSearchMatch: (match: ShipmentSearchMatch) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  onClearFilters: () => void;
}

/** Header sticky mobile — mật độ cao, phẳng, CTA booking ngoài menu. */
export function OpsMobileStickyHeader({
  selectedYmd,
  onDateChange,
  onPrevDay,
  onNextDay,
  onToday,
  isViewingToday,
  syncStatus,
  socketConnected,
  activeWarehouse,
  onAddBooking,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onNavigateCustomers,
  onPrefetchCustomers,
  onOpenAirlineLabels,
  onDownloadDayExcel,
  onDownloadScscDim,
  excelExporting,
  scscDimExporting,
  showDimScsc,
  tcsPortalBar,
  filteredViewRows,
  viewRows,
  onWarehouseChange,
  searchHighlightWarehouses,
  searchQuery,
  onSearchChange,
  statusFilteredRows,
  searchContext,
  searchInputRef,
  onSelectSearchMatch,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
}: Props) {
  const filtersActive = statusFilter !== "ALL" || searchQuery.trim().length > 0;
  const [statusExpanded, setStatusExpanded] = useState(false);

  useEffect(() => {
    if (statusFilter !== "ALL") setStatusExpanded(true);
  }, [statusFilter]);

  const showStatusBar = viewRows.length > 0 && (statusExpanded || statusFilter !== "ALL");

  const searchActive = searchQuery.trim().length > 0;
  const { lotCount, totalPcs, totalKg, totalsTitle } = useMemo(() => {
    const rows = filteredViewRows;
    const pcs = rows.reduce((sum, r) => sum + (r.pcs ?? 0), 0);
    const kg = rows.reduce((sum, r) => sum + (r.kg ?? 0), 0);
    const title = searchActive ? "Tổng lô khớp bộ lọc" : "Tổng theo bộ lọc hiện tại";
    return { lotCount: rows.length, totalPcs: pcs, totalKg: kg, totalsTitle: title };
  }, [filteredViewRows, searchActive]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <div className="flex shrink-0 items-center gap-1 pr-0.5">
          <h1 className="m-0 leading-none">
            <Wordmark size="sm" />
          </h1>
          <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
          {!isViewingToday ? (
            <span className="rounded bg-amber-100 px-1 text-[8px] font-bold text-amber-950" title="Ngày khác">
              Ngày khác
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <OpsDatePicker
            compact
            value={selectedYmd}
            onChange={onDateChange}
            onPrev={onPrevDay}
            onNext={onNextDay}
            onToday={onToday}
            isViewingToday={isViewingToday}
          />
        </div>
        <NewBookingButton iconOnly activeWarehouse={activeWarehouse} onAdd={onAddBooking} />
        <OpsToolsMenu
          compact
          showDimScsc={showDimScsc}
          excelExporting={excelExporting}
          scscDimExporting={scscDimExporting}
          onNavigateCustomers={onNavigateCustomers}
          onPrefetchCustomers={onPrefetchCustomers}
          onOpenAirlineLabels={onOpenAirlineLabels}
          onOpenSheetImport={onOpenSheetImport}
          onPrefetchSheetImport={onPrefetchSheetImport}
          onDownloadDayExcel={onDownloadDayExcel}
          onDownloadScscDim={onDownloadScscDim}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1" title={totalsTitle}>
        <KpiStat label="Lô" value={lotCount} />
        <KpiStat label="Kiện" value={totalPcs} />
        <KpiStat label="Kg" value={formatKgTotal(totalKg)} />
      </div>

      <WarehouseGridPicker
        compact
        hideAddButton
        rows={filteredViewRows}
        active={activeWarehouse}
        onSelect={onWarehouseChange}
        highlightWarehouses={searchHighlightWarehouses}
      />

      {viewRows.length > 0 ? (
        <div className="space-y-1">
          <div className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <SmartSearchBar
                compact
                value={searchQuery}
                onChange={onSearchChange}
                searchableRows={statusFilteredRows}
                matchedRows={filteredViewRows}
                searchContext={searchContext}
                inputRef={searchInputRef}
                onSelectMatch={onSelectSearchMatch}
              />
            </div>
            {!showStatusBar ? (
              <button
                type="button"
                onClick={() => setStatusExpanded(true)}
                className="min-h-9 shrink-0 rounded-xl border border-ui-border bg-ui-surface px-2.5 text-[11px] font-semibold text-ui-text-muted"
              >
                Lọc ST
              </button>
            ) : null}
            {filtersActive ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="min-h-9 shrink-0 rounded-xl px-2 text-[11px] font-semibold text-ui-primary"
              >
                Xóa
              </button>
            ) : null}
          </div>
          {tcsPortalBar}

          {showStatusBar ? (
            <div className="flex min-w-0 items-center gap-1">
              <StatusFilterBar
                compact
                dense
                hideEmpty
                dayRows={viewRows}
                value={statusFilter}
                onChange={onStatusFilterChange}
              />
              {statusFilter === "ALL" ? (
                <button
                  type="button"
                  onClick={() => setStatusExpanded(false)}
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-ui-text-muted"
                  aria-label="Thu gọn lọc trạng thái"
                >
                  ▲
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStatusFilterChange("ALL")}
                  className="shrink-0 rounded-full bg-ui-navy/10 px-2 py-0.5 text-[9px] font-semibold text-ui-navy"
                >
                  {statusLabel[statusFilter as keyof typeof statusLabel]} ×
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
