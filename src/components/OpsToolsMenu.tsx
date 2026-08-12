import { useMemo } from "react";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";

type Props = {
  compact?: boolean;
  showDimScsc?: boolean;
  excelExporting?: boolean;
  scscDimExporting?: boolean;
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  /** Desktop đã có nút Thống kê — chỉ hiện trong menu khi compact (mobile). */
  onNavigateStats?: () => void;
  onPrefetchStats?: () => void;
  onOpenAirlineLabels: () => void;
  onDownloadDayExcel: () => void;
  onDownloadScscDim?: () => void;
  /** Báo cáo đề xuất nâng cấp qua Gemini */
  onOpenAiImprove?: () => void;
  /** AI-1…AI-9: draft/gợi ý Ops có bước xác nhận. */
  onOpenAiWorkbench?: () => void;
};

/**
 * Menu Công cụ — chỉ action thứ cấp chưa có nút riêng ngoài toolbar.
 * (Vantage/Tecs/TCS/SCSC, Nhập Sheet, Thống kê desktop → nút riêng.)
 */
export function OpsToolsMenu({
  compact = false,
  showDimScsc = false,
  excelExporting = false,
  scscDimExporting = false,
  onNavigateCustomers,
  onPrefetchCustomers,
  onNavigateStats,
  onPrefetchStats,
  onOpenAirlineLabels,
  onDownloadDayExcel,
  onDownloadScscDim,
  onOpenAiImprove,
  onOpenAiWorkbench,
}: Props) {
  const items = useMemo(() => {
    const list: OverflowMenuItem[] = [];
    // Mobile không có nút Thống kê ngoài toolbar.
    if (compact && onNavigateStats) {
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
        id: "excel",
        label: excelExporting ? "Đang xuất Excel…" : "Xuất Excel…",
        description: "Ngày hoặc khoảng ngày · Import Shipments",
        onSelect: onDownloadDayExcel,
        disabled: excelExporting,
      },
    );
    if (onOpenAiImprove) {
      list.push({
        id: "ai-improve",
        label: "Đề xuất AI",
        description: "Gemini · phân tích thao tác → gợi ý nâng cấp",
        onSelect: onOpenAiImprove,
      });
    }
    if (onOpenAiWorkbench) {
      list.push({
        id: "ai-workbench",
        label: "Trợ lý AI Ops",
        description: "Booking · hồ sơ · Sheet · eSID · DIM · Ask",
        onSelect: onOpenAiWorkbench,
      });
    }
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
    compact,
    excelExporting,
    onDownloadDayExcel,
    onDownloadScscDim,
    onNavigateCustomers,
    onNavigateStats,
    onOpenAirlineLabels,
    onPrefetchCustomers,
    onPrefetchStats,
    onOpenAiImprove,
    onOpenAiWorkbench,
    scscDimExporting,
    showDimScsc,
  ]);

  return <OverflowMenu label="Công cụ" compact={compact} align="right" items={items} />;
}
