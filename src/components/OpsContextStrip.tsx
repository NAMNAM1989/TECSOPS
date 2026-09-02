import type { ReactNode, RefObject } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { ShipmentSearchContext, ShipmentSearchMatch } from "../utils/shipmentSearch";
import { Button } from "../ui";
import { OpsDayOverviewStrip } from "./OpsDayOverviewStrip";
import { SmartSearchBar } from "./SmartSearchBar";
import { StatusFilterBar, type StatusFilterValue } from "./StatusFilterBar";

type Variant = "desktop" | "mobile";

type Props = {
  variant: Variant;
  selectedYmd: string;
  filteredViewRows: readonly Shipment[];
  viewRows: readonly Shipment[];
  activeWarehouse: Warehouse;
  onWarehouseChange: (wh: Warehouse) => void;
  searchHighlightWarehouses?: readonly Warehouse[];
  filtersActive: boolean;
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
  /** Mobile: ẩn status bar, chỉ nút ST */
  showMobileStatusBar?: boolean;
  onExpandMobileStatus?: () => void;
  mobileStatusTrailing?: ReactNode;
};

function StripDivider() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-ui-border/70" aria-hidden />;
}

/** Kho + tìm kiếm + lọc trong một khối gọn. */
export function OpsContextStrip({
  variant,
  selectedYmd,
  filteredViewRows,
  viewRows,
  activeWarehouse,
  onWarehouseChange,
  searchHighlightWarehouses = [],
  filtersActive,
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
  showMobileStatusBar = true,
  onExpandMobileStatus,
  mobileStatusTrailing,
}: Props) {
  const isMobile = variant === "mobile";
  const hasRows = viewRows.length > 0;

  const overview = (
    <OpsDayOverviewStrip
      variant={variant}
      embedded
      selectedYmd={selectedYmd}
      rows={filteredViewRows}
      activeWarehouse={activeWarehouse}
      onSelectWarehouse={onWarehouseChange}
      highlightWarehouses={searchHighlightWarehouses}
      filtersActive={filtersActive}
    />
  );

  return (
    <div
      data-testid="ops-context-strip"
      data-variant={variant}
      className={
        isMobile
          ? "overflow-hidden rounded-xl bg-gradient-to-b from-ui-background/90 to-ui-surface/50 ring-1 ring-ui-border/45"
          : "border-t border-ui-border/80 bg-ui-background"
      }
    >
      {isMobile ? (
        <>
          <div className="border-b border-ui-border/35 px-1 py-0.5">{overview}</div>
          {hasRows ? (
            <div
              data-testid="ops-mobile-filter-row"
              className="flex min-w-0 items-center gap-1 px-1 py-0.5"
            >
              <div className="min-w-0 flex-1">
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
              </div>
              {!showMobileStatusBar && onExpandMobileStatus ? (
                <>
                  <button
                    type="button"
                    onClick={onExpandMobileStatus}
                    className="inline-flex h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-ui-border/80 bg-ui-surface text-[10px] font-bold text-ui-text-muted shadow-ui-sm"
                    aria-label="Lọc trạng thái"
                    title="Lọc trạng thái"
                  >
                    ST
                  </button>
                  {filtersActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onClearFilters}
                      className="h-9 shrink-0 px-2 text-[10px] font-bold text-ui-primary"
                    >
                      Xóa
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[11px] font-medium text-ui-text-muted">
              Chưa có lô trong ngày · dùng Booking hoặc Sync
            </p>
          )}
          {hasRows && showMobileStatusBar ? (
            <div className="flex min-w-0 items-center gap-1 border-t border-ui-border/35 px-1 py-0.5">
              <StatusFilterBar
                compact
                dense
                tight
                hideEmpty
                warehouse={activeWarehouse}
                dayRows={viewRows}
                value={statusFilter}
                onChange={onStatusFilterChange}
              />
              {mobileStatusTrailing}
            </div>
          ) : null}
        </>
      ) : (
        <div
          data-testid="ops-desktop-context-row"
          className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-5 py-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          {overview}
          {hasRows ? (
            <>
              <StripDivider />
              <div
                data-testid="ops-desktop-filter-row"
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <div className="min-w-[12rem] max-w-lg flex-1">
                  <SmartSearchBar
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
                    inlineFacets
                    debounceMs={200}
                  />
                </div>
                <StripDivider />
                <StatusFilterBar
                  compact
                  dense
                  tight
                  hideEmpty
                  warehouse={activeWarehouse}
                  dayRows={viewRows}
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                />
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-[10px] font-bold text-ui-primary hover:bg-ui-primary/10"
                    title="Xóa mọi bộ lọc"
                  >
                    Xóa lọc
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="shrink-0 text-[11px] font-medium text-ui-text-muted">
              Chưa có lô trong ngày · dùng Booking hoặc Sync
            </p>
          )}
        </div>
      )}
    </div>
  );
}
