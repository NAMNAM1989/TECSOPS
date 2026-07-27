interface Props {
  onOpenSheetImport: () => void;
  onPrefetchSheetImport?: () => void;
  /** Icon-only — mobile header */
  compact?: boolean;
}

/** CTA kéo Google Sheet — luôn hiện ngoài menu Công cụ (desktop + mobile). */
export function OpsSheetImportButton({
  onOpenSheetImport,
  onPrefetchSheetImport,
  compact = false,
}: Props) {
  const icon = (
    <svg
      className={compact ? "h-4 w-4 text-emerald-600" : "h-3.5 w-3.5 text-emerald-600"}
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
        title="Nhập lô từ Google Sheet"
        aria-label="Nhập Sheet"
        onPointerDown={() => onPrefetchSheetImport?.()}
        onClick={onOpenSheetImport}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ui-border bg-ui-surface font-semibold text-ui-text shadow-ui-sm transition hover:border-emerald-500/40 hover:bg-emerald-50/80 active:scale-[0.98]"
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      title="Nhập lô từ Google Sheet BOOK HẰNG NGÀY"
      aria-label="Nhập Sheet"
      onPointerDown={() => onPrefetchSheetImport?.()}
      onClick={onOpenSheetImport}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-[12px] font-bold text-ui-text shadow-ui-sm transition hover:border-emerald-500/40 hover:bg-emerald-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]"
    >
      {icon}
      Nhập Sheet
    </button>
  );
}
