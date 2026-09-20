type Chip = {
  id: string;
  label: string;
  onClear: () => void;
};

type Props = {
  chips: Chip[];
  onClearAll: () => void;
};

/** Chip filter đang áp — Clear từng cái / xóa tất cả. */
export function OpsStatsActiveFilterBar({ chips, onClearAll }: Props) {
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-0.5"
      data-testid="stats-active-filters"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
        Đang lọc
      </span>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-950 ring-1 ring-teal-200/80 hover:bg-teal-100/80"
          onClick={c.onClear}
          title="Bỏ lọc này"
        >
          {c.label}
          <span className="text-teal-700/80" aria-hidden>
            ×
          </span>
        </button>
      ))}
      <button
        type="button"
        className="rounded-full px-2.5 py-1 text-[11px] font-bold text-ui-navy hover:bg-slate-100"
        onClick={onClearAll}
      >
        Xóa lọc
      </button>
    </div>
  );
}
