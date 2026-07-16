interface Props {
  value: string;
  onChange: (ymd: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isViewingToday: boolean;
  /** Gọn — mobile header */
  compact?: boolean;
}

/** Bộ chọn ngày phiên — pill segmented control. */
export function OpsDatePicker({
  value,
  onChange,
  onPrev,
  onNext,
  onToday,
  isViewingToday,
  compact = false,
}: Props) {
  return (
    <div className={`inline-flex min-w-0 items-center ${compact ? "gap-0.5" : "gap-1"}`}>
      <div
        className={`inline-flex min-w-0 flex-1 items-center rounded-full border border-black/[0.05] bg-white shadow-dashboard-card dark:border-white/[0.08] dark:bg-dashboard-surface-dark ${
          compact ? "p-px" : "p-0.5"
        }`}
      >
        <button
          type="button"
          onClick={onPrev}
          className={`rounded-full font-semibold text-dashboard-primary hover:bg-black/[0.04] dark:text-dashboard-primary-dark dark:hover:bg-white/[0.06] ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
          }`}
          aria-label="Ngày trước"
        >
          ‹
        </button>
        <input
          type="date"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onChange(v);
          }}
          className={`min-w-0 flex-1 border-0 bg-transparent px-0.5 font-mono font-semibold text-dashboard-primary focus:outline-none focus:ring-1 focus:ring-apple-blue/30 dark:text-dashboard-primary-dark ${
            compact ? "py-0.5 text-[10px]" : "w-[7.25rem] py-1 text-[11px]"
          }`}
        />
        <button
          type="button"
          onClick={onNext}
          className={`rounded-full font-semibold text-dashboard-primary hover:bg-black/[0.04] dark:text-dashboard-primary-dark dark:hover:bg-white/[0.06] ${
            compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
          }`}
          aria-label="Ngày sau"
        >
          ›
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        disabled={isViewingToday}
        className={`shrink-0 rounded-full bg-apple-blue font-semibold text-white shadow-[0_4px_12px_rgba(0,113,227,0.28)] hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:opacity-45 ${
          compact ? "hidden" : "px-2.5 py-1.5 text-[11px]"
        }`}
      >
        Hôm nay
      </button>
      {compact && !isViewingToday ? (
        <button
          type="button"
          onClick={onToday}
          className="shrink-0 rounded-full bg-apple-blue px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_4px_12px_rgba(0,113,227,0.28)] hover:bg-apple-blue-hover"
        >
          Nay
        </button>
      ) : null}
    </div>
  );
}
