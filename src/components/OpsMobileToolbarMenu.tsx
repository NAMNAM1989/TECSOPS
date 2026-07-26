import { useEffect, useRef, useState } from "react";

interface SheetProps {
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
}

/** Mobile OPS — nhập Google Sheet. */
export function OpsMobileSheetButton({ onOpenSheetImport, onPrefetchSheetImport }: SheetProps) {
  return (
    <button
      type="button"
      title="Nhập lô từ Google Sheet BOOK HẰNG NGÀY"
      aria-label="Nhập Sheet"
      onPointerDown={() => onPrefetchSheetImport?.()}
      onClick={onOpenSheetImport}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white font-semibold text-dashboard-primary shadow-sm transition hover:border-emerald-500/35 hover:bg-emerald-50/70 active:scale-[0.98] dark:border-white/[0.08] dark:bg-dashboard-surface-dark dark:text-dashboard-primary-dark dark:hover:bg-ops-elevated"
    >
      <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5h9M12 3v9" />
      </svg>
    </button>
  );
}

interface MoreMenuProps {
  onNavigateCustomers: () => void;
  onPrefetchCustomers?: () => void;
  onDownloadDayExcel: () => void;
  excelExporting: boolean;
  onOpenAirlineSettings: () => void;
  onDownloadScscDimDay?: () => void;
  scscDimExporting?: boolean;
  showScscDim?: boolean;
}

/** Mobile OPS — menu thêm: Khách, Excel, Tên hãng, DIM SCSC. */
export function OpsMobileMoreMenu({
  onNavigateCustomers,
  onPrefetchCustomers,
  onDownloadDayExcel,
  excelExporting,
  onOpenAirlineSettings,
  onDownloadScscDimDay,
  scscDimExporting = false,
  showScscDim = false,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-dashboard-primary transition hover:bg-slate-100 active:bg-slate-200/80 dark:text-dashboard-primary-dark dark:hover:bg-white/10";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        title="Thêm thao tác"
        aria-label="Menu thêm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white font-bold text-dashboard-primary shadow-sm transition hover:border-sky-500/35 hover:bg-sky-50/70 active:scale-[0.98] dark:border-white/[0.08] dark:bg-dashboard-surface-dark dark:text-dashboard-primary-dark dark:hover:bg-ops-elevated"
      >
        ⋮
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[168px] rounded-xl border border-slate-200/90 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-dashboard-surface-dark"
        >
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            title="Danh bạ khách, hồ sơ in"
            onMouseEnter={() => onPrefetchCustomers?.()}
            onFocus={() => onPrefetchCustomers?.()}
            onClick={() => {
              setOpen(false);
              onNavigateCustomers();
            }}
          >
            Khách hàng
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            disabled={excelExporting}
            onClick={() => {
              setOpen(false);
              onDownloadDayExcel();
            }}
          >
            {excelExporting ? "Excel…" : "Excel ngày"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              setOpen(false);
              onOpenAirlineSettings();
            }}
          >
            Tên hãng in tem
          </button>
          {showScscDim && onDownloadScscDimDay ? (
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              disabled={scscDimExporting}
              onClick={() => {
                setOpen(false);
                onDownloadScscDimDay();
              }}
            >
              {scscDimExporting ? "DIM SCSC…" : "DIM SCSC ngày"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
