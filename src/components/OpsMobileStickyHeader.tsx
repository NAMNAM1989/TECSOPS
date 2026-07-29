import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportImageVariant } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatKgTotal } from "../utils/formatKgTotal";
import { SyncStatusPill, Wordmark } from "../ui";
import { statusLabel } from "./statusStyles";
import { OpsDatePicker } from "./OpsDatePicker";
import { NewBookingButton } from "./NewBookingButton";
import { OpsSheetImportButton } from "./OpsSheetImportButton";
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
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  onCopyCargoDayReport?: (variant?: CargoDayReportImageVariant) => void;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  cargoReportCopying?: boolean;
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

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 rounded-md bg-ui-surface px-1.5 py-0.5 ring-1 ring-ui-border">
      <span className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">{label}</span>
      <span className="font-mono text-[12px] font-extrabold tabular-nums text-ui-navy">{value}</span>
    </span>
  );
}

/** Header sticky mobile — mật độ cao, Coppy Ảnh luôn hiện rõ, tối ưu chỗ cho danh sách lô. */
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

  const { lotCount, totalPcs, totalKg } = useMemo(() => {
    const rows = filteredViewRows;
    const pcs = rows.reduce((sum, r) => sum + (r.pcs ?? 0), 0);
    const kg = rows.reduce((sum, r) => sum + (r.kg ?? 0), 0);
    return { lotCount: rows.length, totalPcs: pcs, totalKg: kg };
  }, [filteredViewRows]);

  return (
    <div className="space-y-1">
      {/* Hàng 1: brand · ngày · CTA gọn */}
      <div className="flex items-center gap-1">
        <div className="flex shrink-0 items-center gap-0.5">
          <h1 className="m-0 leading-none">
            <Wordmark size="sm" />
          </h1>
          <SyncStatusPill status={syncStatus} socketConnected={socketConnected} compact />
          {!isViewingToday ? (
            <span className="rounded bg-amber-100 px-1 text-[8px] font-bold text-amber-950" title="Ngày khác">
              ≠
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
        <OpsSheetImportButton
          compact
          onOpenSheetImport={onOpenSheetImport}
          onPrefetchSheetImport={onPrefetchSheetImport}
        />
        <OpsToolsMenu
          compact
          showDimScsc={showDimScsc}
          excelExporting={excelExporting}
          scscDimExporting={scscDimExporting}
          cargoReportCopying={cargoReportCopying}
          onNavigateCustomers={onNavigateCustomers}
          onPrefetchCustomers={onPrefetchCustomers}
          onNavigateStats={onNavigateStats}
          onPrefetchStats={onPrefetchStats}
          onOpenAirlineLabels={onOpenAirlineLabels}
          onOpenSheetImport={onOpenSheetImport}
          onPrefetchSheetImport={onPrefetchSheetImport}
          onDownloadDayExcel={onDownloadDayExcel}
          onDownloadScscDim={onDownloadScscDim}
          onCopyCargoDayReport={onCopyCargoDayReport}
        />
      </div>

      {/* Hàng 2: KPI + Coppy Ảnh / Hiện Trường */}
      <div className="flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <MiniKpi label="Lô" value={lotCount} />
          <MiniKpi label="Kiện" value={totalPcs} />
          <MiniKpi label="Kg" value={formatKgTotal(totalKg)} />
        </div>
        {onCopyCargoDayReport ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={cargoReportCopying || viewRows.length === 0}
              title="Coppy Ảnh — AWB · Kiện/Kg · Flight · Cutoff · Dest · ngày đỏ = bay cùng phiên"
              onClick={() => onCopyCargoDayReport("basic")}
              className="inline-flex h-8 touch-manipulation items-center gap-0.5 rounded-lg bg-emerald-600 px-2 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {cargoReportCopying ? "…" : "Coppy"}
            </button>
            <button
              type="button"
              disabled={cargoReportCopying || viewRows.length === 0}
              title="Hiện Trường — có Short Code khách + Kiện/Kg · ngày đỏ = bay cùng phiên"
              onClick={() => onCopyCargoDayReport("withCustomer")}
              className="inline-flex h-8 touch-manipulation items-center rounded-lg bg-teal-700 px-2 text-[10px] font-bold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {cargoReportCopying ? "…" : "Hiện Trường"}
            </button>
          </div>
        ) : null}
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
                className="min-h-8 shrink-0 rounded-lg border border-ui-border bg-ui-surface px-2 text-[10px] font-semibold text-ui-text-muted"
              >
                ST
              </button>
            ) : null}
            {filtersActive ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="min-h-8 shrink-0 rounded-lg px-1.5 text-[10px] font-semibold text-ui-primary"
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
                warehouse={activeWarehouse}
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
