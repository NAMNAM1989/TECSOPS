import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { statusLabel } from "./statusStyles";
import { OpsDatePicker } from "./OpsDatePicker";
import { NewBookingButton } from "./NewBookingButton";
import { OpsMobileSheetButton } from "./OpsMobileToolbarMenu";
import { OpsMobileWarehouseChips } from "./OpsMobileWarehouseChips";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";

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

function SyncDot({
  status,
  socketConnected,
}: {
  status: "live" | "degraded" | "offline";
  socketConnected: boolean;
}) {
  const live = status === "live" && socketConnected;
  const degraded = status !== "offline" && (!socketConnected || status === "degraded");
  const cls = live
    ? "bg-emerald-500"
    : degraded
      ? "bg-amber-400"
      : "bg-slate-400";
  const title = live
    ? "Realtime"
    : degraded
      ? "Đồng bộ hạn chế"
      : "Chỉ máy này";

  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} title={title} aria-label={title} />;
}

function formatCompactKg(kg: number): string {
  if (kg >= 10000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return kg.toLocaleString();
}

function MobileHeaderTotals({ lotCount, totalKg, title }: { lotCount: number; totalKg: number; title: string }) {
  return (
    <div
      className="flex shrink-0 flex-col items-end justify-center px-0.5 leading-none"
      title={title}
      aria-label={`${lotCount} lô, ${totalKg.toLocaleString()} kg`}
    >
      <span className="text-[10px] font-extrabold tabular-nums text-dashboard-primary dark:text-dashboard-primary-dark">
        {lotCount} lô
      </span>
      <span className="text-[9px] font-bold tabular-nums text-teal-700 dark:text-teal-400">
        {formatCompactKg(totalKg)} kg
      </span>
    </div>
  );
}

/** Header sticky siêu gọn — ưu tiên diện tích danh sách lô. */
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
  const { lotCount, totalKg, totalsTitle } = useMemo(() => {
    const rows = filteredViewRows;
    const kg = rows.reduce((sum, r) => sum + (r.kg ?? 0), 0);
    const title = searchActive ? "Tổng lô khớp bộ lọc" : "Tổng cả ngày (2 kho)";
    return { lotCount: rows.length, totalKg: kg, totalsTitle: title };
  }, [filteredViewRows, searchActive]);

  return (
    <div className="space-y-1 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-0.5">
        <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
          <h1 className="text-sm font-extrabold tracking-tight text-dashboard-primary dark:text-dashboard-primary-dark">
            TECS<span className="text-teal-600 dark:text-teal-400">OPS</span>
          </h1>
          <SyncDot status={syncStatus} socketConnected={socketConnected} />
          {!isViewingToday ? (
            <span className="rounded bg-amber-100 px-0.5 text-[7px] font-bold text-amber-950" title="Ngày khác">
              !
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
        <MobileHeaderTotals lotCount={lotCount} totalKg={totalKg} title={totalsTitle} />
        <NewBookingButton iconOnly activeWarehouse={activeWarehouse} onAdd={onAddBooking} />
        <OpsMobileSheetButton onOpenSheetImport={onOpenSheetImport} />
      </div>

      <OpsMobileWarehouseChips
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
                className="shrink-0 rounded-full border border-black/[0.06] bg-white px-2 py-1 text-[9px] font-semibold text-dashboard-muted dark:border-white/[0.08] dark:bg-dashboard-surface-dark dark:text-dashboard-muted-dark"
              >
                Lọc ST
              </button>
            ) : null}
            {filtersActive ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="shrink-0 rounded-full px-1.5 py-1 text-[9px] font-semibold text-apple-blue"
              >
                Xóa
              </button>
            ) : null}
          </div>

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
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-dashboard-muted"
                  aria-label="Thu gọn lọc trạng thái"
                >
                  ▲
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStatusFilterChange("ALL")}
                  className="shrink-0 rounded-full bg-dashboard-primary/10 px-2 py-0.5 text-[9px] font-semibold text-dashboard-primary dark:bg-white/10 dark:text-dashboard-primary-dark"
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
