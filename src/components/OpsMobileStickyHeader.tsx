import { useEffect, useMemo, useState, type RefObject, type ReactNode } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { formatKgTotal } from "../utils/formatKgTotal";
import { isTecsHub } from "../constants/warehouses";
import { Wordmark } from "../ui";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { statusLabel, statusLabelCompact } from "./statusStyles";
import { OpsDatePicker } from "./OpsDatePicker";
import { NewBookingButton } from "./NewBookingButton";
import { OpsToolsMenu } from "./OpsToolsMenu";
import { ChromeExtensionsDownloadMenu } from "./ChromeExtensionsDownloadMenu";
import { WarehouseGridPicker } from "./WarehouseGridPicker";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";
import { OpsMobileSyncBar } from "./OpsMobileSyncBar";
import type { SyncStatus } from "../hooks/useShipmentSync";

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
  /** Thanh Cổng TCS dưới ô tìm kiếm (TECS-TCS / TCS) */
  tcsPortalBar?: ReactNode;
  /** Thanh đăng ký eCargo — chỉ khi đang xem kho SCSC trực tiếp */
  ecargoBar?: ReactNode;
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

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 rounded-md bg-ui-surface px-1.5 py-0.5 ring-1 ring-ui-border">
      <span className="text-[9px] font-bold uppercase tracking-wide text-ui-text-muted">{label}</span>
      <span className="font-mono text-[12px] font-extrabold tabular-nums text-ui-navy">{value}</span>
    </span>
  );
}

/** Header sticky mobile Round 3 — chrome thấp, sync rõ, kho chip 1 hàng. */
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
  ecargoBar,
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
  /** Portal/eCargo mặc định thu gọn trên mobile — không mở rộng tính năng TCS, chỉ giảm chrome. */
  const [portalExpanded, setPortalExpanded] = useState(false);

  useEffect(() => {
    if (statusFilter !== "ALL") setStatusExpanded(true);
  }, [statusFilter]);

  const showStatusBar = viewRows.length > 0 && (statusExpanded || statusFilter !== "ALL");
  const hasPortalSlot = Boolean(tcsPortalBar || ecargoBar);

  const scopedMetrics = useMemo(() => {
    const source = filteredViewRows.filter((r) => r.warehouse === activeWarehouse);
    const pcs = source.reduce((sum, r) => sum + (r.pcs ?? 0), 0);
    const kg = source.reduce((sum, r) => sum + (r.kg ?? 0), 0);
    return { lotCount: source.length, totalPcs: pcs, totalKg: kg };
  }, [activeWarehouse, filteredViewRows]);

  const cargoReportItems = useMemo((): OverflowMenuItem[] => {
    if (!onCopyCargoDayReport) return [];
    return [
      {
        id: "vantage",
        label: cargoReportCopying ? "Đang copy…" : "Vantage",
        description: "TECS hub · ẩn khách",
        disabled:
          cargoReportCopying || !viewRows.some((r) => isTecsHub(r.warehouse)),
        onSelect: () => onCopyCargoDayReport("vantage"),
      },
      {
        id: "tecs",
        label: cargoReportCopying ? "Đang copy…" : "Tecs",
        description: "TECS hub · short code",
        disabled:
          cargoReportCopying || !viewRows.some((r) => isTecsHub(r.warehouse)),
        onSelect: () => onCopyCargoDayReport("tecs"),
      },
      {
        id: "tcs",
        label: cargoReportCopying ? "Đang copy…" : "TCS",
        description: "Chỉ kho TCS",
        disabled: cargoReportCopying || !viewRows.some((r) => r.warehouse === "TCS"),
        onSelect: () => onCopyCargoDayReport("tcs"),
      },
      {
        id: "scsc",
        label: cargoReportCopying ? "Đang copy…" : "SCSC",
        description: "Chỉ kho SCSC",
        disabled: cargoReportCopying || !viewRows.some((r) => r.warehouse === "SCSC"),
        onSelect: () => onCopyCargoDayReport("scsc"),
      },
    ];
  }, [cargoReportCopying, onCopyCargoDayReport, viewRows]);

  return (
    <div className="space-y-0.5" data-testid="ops-mobile-sticky-header">
      {/* Hàng 1: brand + CTA icon */}
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h1 className="m-0 leading-none">
            <Wordmark size="sm" />
          </h1>
          {!isViewingToday ? (
            <span className="rounded bg-amber-100 px-1 text-[8px] font-bold text-amber-950" title="Ngày khác">
              ≠
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <NewBookingButton iconOnly activeWarehouse={activeWarehouse} onAdd={onAddBooking} />
          {cargoReportItems.length > 0 ? (
            <OverflowMenu
              compact
              label="Copy ảnh báo cáo"
              items={cargoReportItems}
              triggerClassName="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl border border-ui-border bg-ui-surface text-[10px] font-extrabold text-ui-navy shadow-ui-sm"
            >
              Ảnh
            </OverflowMenu>
          ) : null}
          <ChromeExtensionsDownloadMenu compact />
          <OpsToolsMenu
            compact
            showDimScsc={showDimScsc}
            excelExporting={excelExporting}
            scscDimExporting={scscDimExporting}
            onNavigateCustomers={onNavigateCustomers}
            onPrefetchCustomers={onPrefetchCustomers}
            onNavigateStats={onNavigateStats}
            onPrefetchStats={onPrefetchStats}
            onOpenAirlineLabels={onOpenAirlineLabels}
            onDownloadDayExcel={onDownloadDayExcel}
            onDownloadScscDim={onDownloadScscDim}
          />
        </div>
      </div>

      {/* Sync strip — luôn thấy; không giấu trong menu */}
      <OpsMobileSyncBar
        status={syncStatus}
        socketConnected={socketConnected}
        lotSyncedAt={lotSyncedAt}
        pendingOfflineCount={pendingOfflineCount}
        onRefresh={onSyncRefresh}
        refreshing={syncRefreshing}
      />

      {/* Ngày + KPI kho đang chọn */}
      <div className="flex min-w-0 items-center gap-1.5">
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
        <div className="flex shrink-0 items-center gap-1">
          <MiniKpi label="Lô" value={scopedMetrics.lotCount} />
          <MiniKpi label="Kiện" value={scopedMetrics.totalPcs} />
          <MiniKpi label="Kg" value={formatKgTotal(scopedMetrics.totalKg)} />
        </div>
      </div>

      <WarehouseGridPicker
        chips
        hideAddButton
        rows={filteredViewRows}
        active={activeWarehouse}
        onSelect={onWarehouseChange}
        highlightWarehouses={searchHighlightWarehouses}
      />

      {viewRows.length > 0 ? (
        <div className="space-y-1">
          <div className="flex min-w-0 items-start gap-1.5">
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
            {!showStatusBar ? (
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
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-xl px-2 text-[11px] font-bold text-ui-primary"
              >
                Xóa
              </button>
            ) : null}
          </div>
          {hasPortalSlot ? (
            <div className="space-y-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPortalExpanded((v) => !v)}
                  className="inline-flex min-h-11 min-w-0 flex-1 touch-manipulation items-center justify-between gap-2 rounded-xl border border-ui-border/80 bg-ui-surface px-2.5 text-left text-[11px] font-bold text-ui-text-muted"
                  aria-expanded={portalExpanded}
                >
                  <span className="min-w-0 truncate">
                    {tcsPortalBar ? "Cổng TCS / ESID" : "eCargo SCSC"}
                    {portalExpanded ? "" : " · cần Ext trên PC"}
                  </span>
                  <span aria-hidden>{portalExpanded ? "▴" : "▾"}</span>
                </button>
              </div>
              {portalExpanded ? (
                <div className="min-w-0 space-y-1">
                  {tcsPortalBar}
                  {ecargoBar}
                </div>
              ) : null}
            </div>
          ) : null}

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
        </div>
      ) : null}
    </div>
  );
}
