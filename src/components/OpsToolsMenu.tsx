import { useMemo } from "react";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";

type Props = {
  compact?: boolean;
  showDimScsc?: boolean;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onOpenAirlineLabels: () => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
};

// onPrefetchSheetImport giữ optional (không prefetch khi bắt buộc URL)

/** Gom action thứ cấp Ops — không gồm CTA + Booking. */
export function OpsToolsMenu({
  compact = false,
  showDimScsc = false,
  excelExporting = false,
  scscDimExporting = false,
  onNavigateCustomers,
  onPrefetchCustomers,
  onOpenAirlineLabels,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onDownloadDayExcel,
  onDownloadScscDim,
}: Props) {
  const items = useMemo(() => {
    const list: OverflowMenuItem[] = [
      {
        id: "customers",
        label: "Khách",
        description: "Danh bạ & hồ sơ in",
        onSelect: onNavigateCustomers,
        onPrefetch: onPrefetchCustomers,
      },
      {
        id: "airline",
        label: "Tên hãng",
        description: "Tên in trên tem",
        onSelect: onOpenAirlineLabels,
      },
      {
        id: "sheet",
        label: "Nhập Sheet",
        description: "Dán URL Google Sheet mỗi lần",
        onSelect: onOpenSheetImport,
        onPrefetch: onPrefetchSheetImport,
      },
      {
        id: "excel",
        label: excelExporting ? "Đang xuất Excel…" : "Xuất Excel…",
        description: "Ngày hoặc khoảng ngày · Import Shipments",
        onSelect: onDownloadDayExcel,
        disabled: excelExporting,
      },
    ];
    if (showDimScsc && onDownloadScscDim) {
      list.push({
        id: "dim-scsc",
        label: scscDimExporting ? "Đang xuất DIM…" : "Xuất LIST DIM SCSC (ngày)",
        description: "Excel LIST DIM theo ngày phiên",
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
    onOpenAirlineLabels,
    onOpenSheetImport,
    onPrefetchCustomers,
    onPrefetchSheetImport,
    scscDimExporting,
    showDimScsc,
  ]);

  return <OverflowMenu label="Công cụ" compact={compact} align="right" items={items} />;
}
