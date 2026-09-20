export type StatsKpiItem = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
  /** Nhãn so sánh kỳ trước, vd. "+12%" / "mới" / "—" */
  deltaLabel?: string;
  deltaPositive?: boolean;
};

/** Hàng KPI — scroll ngang trên mobile. */
export function StatsKpiStrip({ items }: { items: StatsKpiItem[] }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm"
      data-testid="stats-kpi-strip"
    >
      <div className="flex gap-0 overflow-x-auto divide-x divide-ui-border/60 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6 lg:divide-y-0 [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div
            key={item.label}
            title={item.hint}
            className="min-w-[7.5rem] shrink-0 px-3.5 py-3.5 sm:min-w-0 sm:px-4"
          >
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-ui-text-muted">
              {item.label}
            </p>
            <p
              className={`m-0 mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-[1.35rem] ${
                item.accent ? "text-amber-800" : "text-ui-navy"
              }`}
            >
              {item.value}
            </p>
            {item.deltaLabel ? (
              <p
                className={`m-0 mt-1 text-[10px] font-semibold tabular-nums ${
                  item.deltaPositive
                    ? "text-emerald-700"
                    : item.deltaLabel.startsWith("-")
                      ? "text-rose-700"
                      : "text-ui-text-muted"
                }`}
              >
                vs kỳ trước {item.deltaLabel}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function formatStatsPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n}%`;
}
