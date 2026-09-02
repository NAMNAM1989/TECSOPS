import { useMemo, type ReactNode } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CargoDayReportCopyKind } from "../utils/cargoDayReportImage";
import { NewBookingButton } from "./NewBookingButton";
import { OpsSheetImportButton } from "./OpsSheetImportButton";
import { listOpsCargoReportActions } from "./opsCargoReportItems";

type Variant = "desktop" | "mobile";

type Props = {
  variant: Variant;
  activeWarehouse: Warehouse;
  onAddBooking: (wh: Warehouse) => void;
  includeBooking?: boolean;
  includeSheet?: boolean;
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  onDownloadDayExcel: () => void;
  excelExporting?: boolean;
  viewRows: readonly Shipment[];
  cargoReportCopying?: boolean;
  onCopyCargoDayReport: (kind: CargoDayReportCopyKind) => void;
  /** Gắn cùng hàng identity — không bọc thêm, không cuộn riêng. */
  embedded?: boolean;
};

const REPORT_TONE: Record<CargoDayReportCopyKind, string> = {
  vantage: "border-slate-300/90 bg-slate-50 text-slate-800 hover:bg-slate-100",
  tecs: "border-teal-300/90 bg-teal-50 text-teal-900 hover:bg-teal-100",
  tcs: "border-sky-300/90 bg-sky-50 text-sky-900 hover:bg-sky-100",
  scsc: "border-violet-300/90 bg-violet-50 text-violet-900 hover:bg-violet-100",
};

function ToolbarSegment({
  label,
  mobile,
  embedded,
  children,
}: {
  label: string;
  mobile: boolean;
  embedded?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <div
        className="flex shrink-0 items-center gap-0.5 border-r border-ui-border/60 pr-1 last:border-r-0 last:pr-0"
        role="group"
        aria-label={label}
      >
        <span className="sr-only">{label}</span>
        <div className="flex min-w-0 items-center gap-0.5">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-1 rounded-xl ring-1 ring-ui-border/60 ${
        mobile ? "bg-ui-surface px-1 py-1" : "bg-ui-surface/95 px-1 py-0.5"
      }`}
      role="group"
      aria-label={label}
    >
      <span
        className={`shrink-0 select-none font-extrabold uppercase tracking-wide text-ui-text-muted ${
          mobile ? "px-1 text-[9px]" : "px-1 text-[8px]"
        }`}
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

function ToolChip({
  mobile,
  title,
  label,
  shortLabel,
  disabled,
  onClick,
  onPrefetch,
  children,
}: {
  mobile: boolean;
  title: string;
  label: string;
  shortLabel?: string;
  disabled?: boolean;
  onClick: () => void;
  onPrefetch?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg font-semibold text-ui-text transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-40 ${
        mobile
          ? "min-h-10 touch-manipulation px-2 text-[11px] active:scale-[0.98] hover:bg-ui-surface-muted"
          : "h-8 px-2 text-[11px] hover:bg-ui-surface-muted"
      }`}
    >
      {children}
      <span>{mobile && shortLabel ? shortLabel : label}</span>
    </button>
  );
}

function IconSheet({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4h7l3 3v13a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z" />
    </svg>
  );
}

function IconCamera({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 7.5 8.1 5.85A1.5 1.5 0 0 1 9.2 5.4h5.6a1.5 1.5 0 0 1 1.1.45L17.25 7.5H19.5A1.5 1.5 0 0 1 21 9v8.25A1.5 1.5 0 0 1 19.5 18.75h-15A1.5 1.5 0 0 1 3 17.25V9A1.5 1.5 0 0 1 4.5 7.5h2.25Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.15a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z" />
    </svg>
  );
}

/** Thanh thao tác Ops — Lệnh / Xuất / Ảnh. Nav (Khách·Hãng·Thống kê) ở rail / bottom nav. */
export function OpsActionToolbar({
  variant,
  activeWarehouse,
  onAddBooking,
  includeBooking = true,
  includeSheet = true,
  onOpenSheetImport,
  onPrefetchSheetImport,
  onDownloadDayExcel,
  excelExporting = false,
  viewRows,
  cargoReportCopying = false,
  onCopyCargoDayReport,
  embedded = false,
}: Props) {
  const isMobile = variant === "mobile";
  const iconCls = isMobile ? "h-3.5 w-3.5 shrink-0 text-ui-text-muted" : "h-3 w-3 shrink-0 text-ui-text-muted";
  const cargoActions = useMemo(
    () => listOpsCargoReportActions({ viewRows, copying: cargoReportCopying }),
    [cargoReportCopying, viewRows],
  );

  const showPrimary = includeBooking || includeSheet;

  return (
    <div
      data-testid="ops-action-toolbar"
      data-variant={variant}
      data-embedded={embedded ? "true" : undefined}
      role="toolbar"
      aria-label="Thao tác Ops"
      className={
        embedded
          ? "flex shrink-0 items-center gap-1"
          : `flex min-w-0 items-center justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-xl bg-ui-background/70 p-1 ring-1 ring-ui-border/50 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden ${
              isMobile ? "touch-pan-x" : ""
            }`
      }
    >
      {showPrimary ? (
        <ToolbarSegment label="Lệnh" mobile={isMobile} embedded={embedded}>
          {includeBooking ? (
            <NewBookingButton
              activeWarehouse={activeWarehouse}
              onAdd={onAddBooking}
              iconOnly={isMobile}
            />
          ) : null}
          {includeSheet ? (
            <OpsSheetImportButton
              compact={isMobile}
              onOpenSheetImport={onOpenSheetImport}
              onPrefetchSheetImport={onPrefetchSheetImport}
            />
          ) : null}
        </ToolbarSegment>
      ) : null}

      <ToolbarSegment label="Xuất" mobile={isMobile} embedded={embedded}>
        <ToolChip
          mobile={isMobile}
          title="Xuất Excel ngày hoặc khoảng ngày"
          label={excelExporting ? "Đang xuất…" : isMobile ? "Excel" : "Xuất Excel"}
          shortLabel={excelExporting ? "…" : "XL"}
          disabled={excelExporting}
          onClick={onDownloadDayExcel}
        >
          <IconSheet className={iconCls} />
        </ToolChip>
      </ToolbarSegment>

      <ToolbarSegment label="Ảnh" mobile={isMobile} embedded={embedded}>
        <span className="inline-flex shrink-0 items-center px-0.5 text-ui-text-muted" title="Copy ảnh báo cáo">
          <IconCamera className={iconCls} />
        </span>
        <div
          data-testid="ops-cargo-report-toolbar"
          role="group"
          aria-label="Ảnh báo cáo lô hàng"
          aria-busy={cargoReportCopying || undefined}
          className="flex items-center gap-0.5"
        >
          {cargoActions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-testid={`ops-cargo-report-${action.id}`}
              data-kind={action.id}
              disabled={action.disabled}
              title={`${action.label} — ${action.description}${cargoReportCopying ? " · Đang copy…" : ""}`}
              aria-label={`Ảnh báo cáo ${action.label}`}
              onClick={() => {
                if (action.disabled) return;
                onCopyCargoDayReport(action.id);
              }}
              className={`inline-flex shrink-0 items-center rounded-lg border font-extrabold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:cursor-not-allowed disabled:opacity-35 ${
                isMobile
                  ? "min-h-10 touch-manipulation border px-2 text-[11px] active:scale-[0.98]"
                  : "h-8 border px-1.5 text-[10px]"
              } ${REPORT_TONE[action.id]}`}
            >
              {action.label}
            </button>
          ))}
        </div>
        {cargoReportCopying ? (
          <span className="shrink-0 px-1 text-[10px] font-semibold text-ui-text-muted" aria-live="polite">
            …
          </span>
        ) : null}
      </ToolbarSegment>
    </div>
  );
}
