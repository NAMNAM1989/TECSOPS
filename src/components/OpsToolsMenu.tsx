import { useMemo } from "react";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";

type Props = {
  compact?: boolean;
  showDimScsc?: boolean;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  cargoReportCopying?: boolean;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onOpenAirlineLabels: () => void;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  onCopyCargoDayReport?: (kind?: CargoDayReportCopyKind) => void;
};

// onPrefetchSheetImport giữ optional (không prefetch khi bắt buộc URL)

/** Gom action thứ cấp Ops — không gồm CTA + Booking. */
export function OpsToolsMenu({
  compact = false,
  showDimScsc = false,
  excelExporting = false,
  scscDimExporting = false,
  cargoReportCopying = false,
  onNavigateCustomers,
  onPrefetchCustomers,
  onNavigateStats,
  onPrefetchStats,
  onOpenAirlineLabels,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onDownloadDayExcel,
  onDownloadScscDim,
  onCopyCargoDayReport,
}: Props) {
  const items = useMemo(() => {
    const list: OverflowMenuItem[] = [];
    if (onCopyCargoDayReport) {
      list.push(
        {
          id: "cargo-report-vantage",
          label: cargoReportCopying ? "Đang copy ảnh…" : "Vantage",
          description: "Kho TECS (TECS-TCS+TECS-SCSC), không gồm kho TCS/SCSC · ẩn khách",
          onSelect: () => onCopyCargoDayReport("vantage"),
          disabled: cargoReportCopying,
        },
        {
          id: "cargo-report-tecs",
          label: cargoReportCopying ? "Đang copy ảnh…" : "Tecs",
          description: "Kho TECS (TECS-TCS+TECS-SCSC), không gồm kho TCS/SCSC",
          onSelect: () => onCopyCargoDayReport("tecs"),
          disabled: cargoReportCopying,
        },
        {
          id: "cargo-report-tcs",
          label: cargoReportCopying ? "Đang copy ảnh…" : "TCS",
          description: "Chỉ kho TCS — không gồm mã TECS-TCS",
          onSelect: () => onCopyCargoDayReport("tcs"),
          disabled: cargoReportCopying,
        },
        {
          id: "cargo-report-scsc",
          label: cargoReportCopying ? "Đang copy ảnh…" : "SCSC",
          description: "Chỉ kho SCSC — không gồm mã TECS-SCSC",
          onSelect: () => onCopyCargoDayReport("scsc"),
          disabled: cargoReportCopying,
        },
      );
    }
    if (onNavigateStats) {
      list.push({
        id: "stats",
        label: "Thống kê",
        description: "Lô · Kg · DIM · Chargeable theo kỳ",
        onSelect: onNavigateStats,
        onPrefetch: onPrefetchStats,
      });
    }
    list.push(
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
      }
    );
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
  ]);

  return <OverflowMenu label="Công cụ" compact={compact} align="right" items={items} />;
}
