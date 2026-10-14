import { useMemo } from "react";
import type { Shipment } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { buildOpsCargoReportItems } from "./opsCargoReportItems";

type Props = {
  viewRows: readonly Shipment[];
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onDownloadDayExcel: () => void;
  excelExporting?: boolean;
  cargoReportCopying?: boolean;
  onCopyCargoDayReport: (kind: CargoDayReportCopyKind) => void;
  /** Nằm trong panel 🔍 — không border hàng sticky riêng. */
  embedded?: boolean;
};

/** Overflow Sync / Excel / ảnh. Mobile: thường gộp trong panel tìm kiếm. */
export function OpsMobileToolbar({
  viewRows,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onDownloadDayExcel,
  excelExporting = false,
  cargoReportCopying = false,
  onCopyCargoDayReport,
  embedded = false,
}: Props) {
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
      <OverflowMenu
        label="Thêm thao tác"
        items={overflowItems}
        compact
        triggerClassName={`inline-flex shrink-0 touch-manipulation items-center justify-center border border-ui-border/90 bg-ui-surface font-bold text-ui-text transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus min-h-11 min-w-11 rounded-lg px-2 text-2xs sm:text-xs shadow-ui-sm`}
      >
        Thêm ▾
      </OverflowMenu>
    </div>
  );
}
