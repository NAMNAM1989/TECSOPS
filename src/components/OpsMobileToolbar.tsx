import { useMemo, useState, type ReactNode } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import { statusLabel } from "./statusStyles";
import type { StatusFilterValue } from "./StatusFilterBar";
import type { OverflowMenuItem } from "../ui/OverflowMenu";
import { buildOpsCargoReportItems } from "./opsCargoReportItems";
import { MOBILE, mobileSheetBackdrop } from "../styles/mobileOpsStyles";
import { useIsMobile } from "../hooks/useIsMobile";
import { useOpsMobileOverlayLock } from "../hooks/useOpsMobileOverlayLock";

type SheetId = "filter" | "tools" | null;

type Props = {
  activeWarehouse: Warehouse;
  viewRows: readonly Shipment[];
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  showDimScsc?: boolean;
  cargoReportCopying?: boolean;
  onCopyCargoDayReport: (kind: CargoDayReportCopyKind) => void;
};

function OpsChromeSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  useOpsMobileOverlayLock(open);
  if (!open) return null;
  return (
    <div
      className={mobileSheetBackdrop(isMobile)}
      role="presentation"
      data-testid="ops-mobile-chrome-sheet"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={MOBILE.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ui-border px-4 py-3">
          <h2 className="text-base font-semibold leading-6 text-ui-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-ui-md text-[13px] font-semibold text-ui-text-muted hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
            aria-label="Đóng"
          >
            Đóng
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Chip lọc + ⋯ — sheet đáy, không thanh cao thứ hai. */
export function OpsMobileToolbar({
  activeWarehouse,
  viewRows,
  statusFilter,
  onStatusFilterChange,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onNavigateStats,
  onPrefetchStats,
  onNavigateCustomers,
  onPrefetchCustomers,
  onOpenAirlineLabels,
  onDownloadDayExcel,
  onDownloadScscDim,
  excelExporting = false,
  scscDimExporting = false,
  showDimScsc = false,
  cargoReportCopying = false,
  onCopyCargoDayReport,
}: Props) {
  const [sheet, setSheet] = useState<SheetId>(null);

  const statusOrder = useMemo(
    () => statusOrderForFilter(activeWarehouse),
    [activeWarehouse],
  );

  const statusCounts = useMemo(() => {
    const m = new Map<ShipmentStatus, number>();
    for (const st of statusOrder) m.set(st, 0);
    for (const r of viewRows) {
      if (m.has(r.status)) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    }
    return m;
  }, [viewRows, statusOrder]);

  const overflowItems = useMemo((): OverflowMenuItem[] => {
    const items: OverflowMenuItem[] = [
      {
        id: "sheet",
        label: "Nhập Sheet",
        description: "Google Sheet phiên ngày",
        onSelect: onOpenSheetImport,
        onPrefetch: onPrefetchSheetImport,
      },
      {
        id: "excel",
        label: excelExporting ? "Đang xuất Excel…" : "Xuất Excel",
        description: "Báo cáo ngày hoặc khoảng ngày",
        disabled: excelExporting,
        onSelect: onDownloadDayExcel,
      },
    ];
    if (showDimScsc && onDownloadScscDim) {
      items.push({
        id: "scsc-dim",
        label: scscDimExporting ? "Đang xuất DIM…" : "DIM SCSC",
        description: "Excel LIST DIM theo ngày phiên",
        disabled: scscDimExporting,
        onSelect: onDownloadScscDim,
      });
    }
    items.push(
      ...buildOpsCargoReportItems({
        viewRows,
        copying: cargoReportCopying,
        onCopy: onCopyCargoDayReport,
      }),
    );
    items.push(
      {
        id: "airline-labels",
        label: "Tên hãng in tem",
        onSelect: onOpenAirlineLabels,
      },
      {
        id: "customers",
        label: "Danh bạ khách",
        onSelect: onNavigateCustomers,
        onPrefetch: onPrefetchCustomers,
      },
    );
    if (onNavigateStats) {
      items.push({
        id: "stats",
        label: "Thống kê",
        onSelect: onNavigateStats,
        onPrefetch: onPrefetchStats,
      });
    }
    return items;
  }, [
    cargoReportCopying,
    excelExporting,
    onCopyCargoDayReport,
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
    viewRows,
  ]);

  const filterActive = statusFilter !== "ALL";
  const filterChipLabel = filterActive
    ? statusLabel[statusFilter as ShipmentStatus]
    : "Tất cả";

  return (
    <div data-testid="ops-mobile-toolbar" className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        data-testid="ops-mobile-filter-chip"
        onClick={() => setSheet("filter")}
        aria-label={`Lọc trạng thái · ${filterChipLabel}`}
        className={`inline-flex h-7 min-h-11 touch-manipulation items-center rounded-full px-3 text-[13px] font-semibold leading-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
          filterActive
            ? "bg-ui-primary text-white"
            : "bg-ui-surface-muted text-ui-text-muted"
        }`}
      >
        <span className="whitespace-nowrap">{filterChipLabel}</span>
      </button>
      <button
        type="button"
        data-testid="ops-mobile-tools-overflow"
        onClick={() => {
          overflowItems.forEach((item) => item.onPrefetch?.());
          setSheet("tools");
        }}
        aria-label="Thêm thao tác"
        className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-ui-md text-lg font-bold leading-none text-ui-text hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
      >
        ⋯
      </button>

      <OpsChromeSheet
        open={sheet === "filter"}
        title="Lọc trạng thái"
        onClose={() => setSheet(null)}
      >
        <ul className="space-y-1" aria-label="Lọc trạng thái">
          <li>
            <button
              type="button"
              onClick={() => {
                onStatusFilterChange("ALL");
                setSheet(null);
              }}
              className={`flex min-h-11 w-full touch-manipulation items-center justify-between rounded-ui-md px-3 text-left text-[16px] leading-6 ${
                statusFilter === "ALL"
                  ? "bg-ui-primary text-white"
                  : "bg-ui-surface-muted text-ui-text"
              }`}
            >
              <span className="font-semibold">Tất cả</span>
              <span className="font-mono tabular-nums">{viewRows.length}</span>
            </button>
          </li>
          {statusOrder.map((st) => {
            const count = statusCounts.get(st) ?? 0;
            if (count === 0 && statusFilter !== st) return null;
            const selected = statusFilter === st;
            return (
              <li key={st}>
                <button
                  type="button"
                  onClick={() => {
                    onStatusFilterChange(st);
                    setSheet(null);
                  }}
                  className={`flex min-h-11 w-full touch-manipulation items-center justify-between rounded-ui-md px-3 text-left text-[16px] leading-6 ${
                    selected
                      ? "bg-ui-primary text-white"
                      : "bg-ui-surface-muted text-ui-text"
                  }`}
                >
                  <span className="font-semibold">{statusLabel[st]}</span>
                  <span className="font-mono tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </OpsChromeSheet>

      <OpsChromeSheet
        open={sheet === "tools"}
        title="Thao tác"
        onClose={() => setSheet(null)}
      >
        <ul className="space-y-1">
          {overflowItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  setSheet(null);
                  item.onSelect();
                }}
                className="flex min-h-11 w-full touch-manipulation flex-col justify-center rounded-ui-md bg-ui-surface-muted px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-[16px] font-semibold leading-6 text-ui-text">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="text-[13px] leading-[18px] text-ui-text-muted">
                    {item.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </OpsChromeSheet>
    </div>
  );
}
