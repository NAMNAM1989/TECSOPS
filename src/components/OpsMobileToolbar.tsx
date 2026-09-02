import { useMemo } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import { statusLabel, statusLabelCompact } from "./statusStyles";
import type { StatusFilterValue } from "./StatusFilterBar";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { buildOpsCargoReportItems } from "./opsCargoReportItems";

type Props = {
  activeWarehouse: Warehouse;
  viewRows: readonly Shipment[];
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onDownloadDayExcel: () => void;
  excelExporting?: boolean;
  cargoReportCopying?: boolean;
  onCopyCargoDayReport: (kind: CargoDayReportCopyKind) => void;
  /** Nằm trong panel 🔍 — không border hàng sticky riêng. */
  embedded?: boolean;
};

/** Lọc trạng thái + overflow (Sync, Excel, ảnh). Mobile: thường gộp trong panel tìm kiếm. */
export function OpsMobileToolbar({
  activeWarehouse,
  viewRows,
  statusFilter,
  onStatusFilterChange,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onDownloadDayExcel,
  excelExporting = false,
  cargoReportCopying = false,
  onCopyCargoDayReport,
  embedded = false,
}: Props) {
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
        label: "Sync",
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
    items.push(
      ...buildOpsCargoReportItems({
        viewRows,
        copying: cargoReportCopying,
        onCopy: onCopyCargoDayReport,
      }),
    );
    return items;
  }, [
    cargoReportCopying,
    excelExporting,
    onCopyCargoDayReport,
    onDownloadDayExcel,
    onOpenSheetImport,
    onPrefetchSheetImport,
    viewRows,
  ]);

  if (viewRows.length === 0) return null;

  const controlH = embedded
    ? "min-h-9 rounded-lg px-2.5 text-[12px]"
    : "min-h-11 rounded-xl px-3 text-[13px] shadow-ui-sm";

  return (
    <div
      data-testid="ops-mobile-toolbar"
      data-embedded={embedded ? "true" : undefined}
      className={
        embedded
          ? "mt-1.5 flex items-center gap-1.5"
          : "flex items-center gap-2 border-t border-ui-border/70 bg-ui-surface px-2.5 py-1.5"
      }
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Lọc trạng thái</span>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilterValue)}
          className={`box-border w-full touch-manipulation border border-ui-border/90 bg-ui-surface font-semibold text-ui-text outline-none focus:border-ui-primary/50 focus:ring-2 focus:ring-ui-focus ${controlH}`}
          aria-label="Lọc trạng thái"
        >
          <option value="ALL">Tất cả · {viewRows.length}</option>
          {statusOrder.map((st) => {
            const count = statusCounts.get(st) ?? 0;
            if (count === 0 && statusFilter !== st) return null;
            const label =
              statusLabelCompact[st as keyof typeof statusLabelCompact] ??
              statusLabel[st as keyof typeof statusLabel];
            return (
              <option key={st} value={st}>
                {label} · {count}
              </option>
            );
          })}
        </select>
      </label>
      <OverflowMenu
        label="Thêm thao tác"
        items={overflowItems}
        compact
        triggerClassName={`inline-flex shrink-0 touch-manipulation items-center justify-center border border-ui-border/90 bg-ui-surface font-bold text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
          embedded ? "min-h-9 min-w-9 rounded-lg px-2 text-[11px]" : "min-h-11 min-w-11 rounded-xl px-3 text-[13px] shadow-ui-sm"
        }`}
      >
        Thêm ▾
      </OverflowMenu>
    </div>
  );
}
