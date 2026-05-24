interface Props {
  value: string;
  onChange: (ymd: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isViewingToday: boolean;
}

/** Bộ chọn ngày phiên — pill segmented control. */
export function OpsDatePicker({ value, onChange, onPrev, onNext, onToday, isViewingToday }: Props) {
  return (
    <div className="inline-flex items-center gap-1">
      <div className="inline-flex items-center rounded-full border border-black/[0.05] bg-white p-0.5 shadow-dashboard-card dark:border-white/[0.08] dark:bg-dashboard-surface-dark">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-full px-2 py-1 text-xs font-semibold text-dashboard-primary hover:bg-black/[0.04] dark:text-dashboard-primary-dark dark:hover:bg-white/[0.06]"
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
          className="w-[7.25rem] border-0 bg-transparent px-1 py-1 font-mono text-[11px] font-semibold text-dashboard-primary focus:outline-none focus:ring-1 focus:ring-apple-blue/30 dark:text-dashboard-primary-dark"
        />
        <button
          type="button"
          onClick={onNext}
          className="rounded-full px-2 py-1 text-xs font-semibold text-dashboard-primary hover:bg-black/[0.04] dark:text-dashboard-primary-dark dark:hover:bg-white/[0.06]"
          aria-label="Ngày sau"
        >
          ›
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        disabled={isViewingToday}
        className="rounded-full bg-apple-blue px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(0,113,227,0.28)] hover:bg-apple-blue-hover disabled:cursor-not-allowed disabled:opacity-45"
      >
        Hôm nay
      </button>
    </div>
  );
}
