interface Props {
  onOpenSheetImport: () => void;
}

/** Mobile OPS — chỉ nhập Google Sheet (không menu phụ). */
export function OpsMobileSheetButton({ onOpenSheetImport }: Props) {
  return (
    <button
      type="button"
      title="Nhập lô từ Google Sheet BOOK HẰNG NGÀY"
      aria-label="Nhập Sheet"
      onClick={onOpenSheetImport}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white font-semibold text-dashboard-primary shadow-sm transition hover:border-emerald-500/35 hover:bg-emerald-50/70 active:scale-[0.98] dark:border-white/[0.08] dark:bg-dashboard-surface-dark dark:text-dashboard-primary-dark dark:hover:bg-ops-elevated"
    >
      <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5h9M12 3v9" />
      </svg>
    </button>
  );
}
