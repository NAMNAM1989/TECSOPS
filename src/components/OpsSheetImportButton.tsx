interface Props {
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  /** Icon-only — mobile header */
  compact?: boolean;
}

/** CTA Sync Google Sheet — luôn hiện ngoài menu Công cụ (desktop + mobile). */
export function OpsSheetImportButton({
  onOpenSheetImport,
  onPrefetchSheetImport,
  compact = false,
}: Props) {
  const icon = (
    <svg
      className={`${compact ? "h-4 w-4" : "h-3.5 w-3.5"} text-emerald-600 transition-transform duration-200 ease-fluid group-hover:-translate-y-0.5 group-hover:scale-110`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5h9M12 3v9"
      />
    </svg>
  );

  if (compact) {
    return (
      <button
        type="button"
        title="Sync lô từ Google Sheet"
        aria-label="Sync"
        onPointerDown={() => onPrefetchSheetImport?.()}
        onClick={onOpenSheetImport}
        className="group btn-kinetic inline-flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-ui-border bg-ui-surface font-semibold text-ui-text shadow-ui-sm hover:border-emerald-500/50 hover:bg-emerald-50/80 hover:shadow-ui-md"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Sync lô từ Google Sheet BOOK HẰNG NGÀY"
      aria-label="Sync"
      onPointerDown={() => onPrefetchSheetImport?.()}
      onClick={onOpenSheetImport}
      className="group btn-kinetic inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-[12px] font-bold text-ui-text shadow-ui-sm hover:border-emerald-500/50 hover:bg-emerald-50/80 hover:shadow-ui-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
    >
      {icon}
      Sync
    </button>
  );
}
