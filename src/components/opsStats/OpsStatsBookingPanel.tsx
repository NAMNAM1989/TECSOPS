import { formatKgTotal } from "../../utils/formatKgTotal";
import type {
  FlightDestIntelRow,
  FlightDestSignal,
} from "../../utils/opsStatsIntelligence";
import type {
  ForecastDayRow,
  NextWeekLaneSuggestion,
} from "../../utils/opsStatsForecast";

const SIGNAL_LABEL: Record<FlightDestSignal, string> = {
  surge: "Tăng đột biến",
  miss: "Thấp / trống",
  normal: "Ổn",
  new: "Mới",
};

const SIGNAL_CLASS: Record<FlightDestSignal, string> = {
  surge: "bg-amber-50 text-amber-950 ring-amber-200/80",
  miss: "bg-rose-50 text-rose-950 ring-rose-200/80",
  normal: "bg-slate-50 text-slate-700 ring-slate-200/80",
  new: "bg-sky-50 text-sky-950 ring-sky-200/80",
};

const CONF_LABEL: Record<ForecastDayRow["confidence"], string> = {
  low: "Thấp",
  mid: "TB",
  high: "Cao",
};

type Props = {
  focusYmd: string;
  todayYmd: string;
  insights: readonly string[];
  flightDest: readonly FlightDestIntelRow[];
  missLanes: readonly FlightDestIntelRow[];
  nextWeek: readonly NextWeekLaneSuggestion[];
  forecast: readonly ForecastDayRow[];
  onFocusYmdChange?: (ymd: string) => void;
  onSelectFlightDest?: (flightKey: string, dest: string) => void;
};

export function OpsStatsBookingPanel({
  focusYmd,
  todayYmd,
  insights,
  flightDest,
  missLanes,
  nextWeek,
  forecast,
  onFocusYmdChange,
  onSelectFlightDest,
}: Props) {
  const ranked = flightDest
    .filter(
      (r) =>
        r.lots > 0 ||
        r.signal === "new" ||
        r.signal === "surge" ||
        r.signal === "normal"
    )
    .slice(0, 20);
  const isToday = focusYmd === todayYmd;

  return (
    <div className="space-y-3" data-testid="stats-booking-panel">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ui-text-muted">
            Ngày focus (baseline DOW)
          </span>
          <input
            type="date"
            className="min-h-9 rounded-lg border border-ui-border/80 bg-ui-surface px-2.5 py-1.5 text-sm text-ui-text outline-none focus:border-ui-primary/45 focus:ring-2 focus:ring-ui-focus/80"
            value={focusYmd}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onFocusYmdChange?.(v);
            }}
          />
        </label>
        {!isToday ? (
          <button
            type="button"
            className="min-h-9 rounded-lg border border-ui-border/80 bg-ui-surface px-2.5 text-[11px] font-bold text-ui-navy hover:bg-slate-50"
            onClick={() => onFocusYmdChange?.(todayYmd)}
          >
            Hôm nay
          </button>
        ) : null}
        <p className="pb-1.5 text-[11px] text-ui-text-muted">
          Baseline = TB cùng weekday · tối đa 8 tuần trước focus
        </p>
      </div>

      {insights.length > 0 ? (
        <section className="rounded-2xl border border-teal-200/70 bg-teal-50/40 px-3.5 py-3 sm:px-4">
          <h3 className="m-0 text-[12px] font-extrabold uppercase tracking-wider text-teal-900">
            Gợi ý booking · {focusYmd}
          </h3>
          <ul className="mb-0 mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-teal-950">
            {insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-2xl border border-ui-border/70 bg-ui-surface px-4 py-6 text-center text-sm text-ui-text-muted">
          Chưa đủ dữ liệu để tạo gợi ý booking cho {focusYmd}.
        </p>
      )}

      {missLanes.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-rose-300/80 bg-rose-50/30 shadow-ui-sm">
          <header className="border-b border-rose-200/70 px-3.5 py-2.5 sm:px-4">
            <h3 className="m-0 text-[13px] font-extrabold text-rose-950">
              Chuyến thường chạy nhưng trống
            </h3>
            <p className="m-0 mt-0.5 text-[11px] text-rose-900/70">
              Baseline ≥ 1 lô cùng DOW · click để lọc bảng lô
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-rose-200/60 bg-rose-50/60 text-[10px] uppercase tracking-wider text-rose-900/70">
                  <th className="px-3.5 py-2.5 font-bold">Chuyến</th>
                  <th className="px-3.5 py-2.5 font-bold">Dest</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">TB DOW</th>
                  <th className="px-3.5 py-2.5 font-bold">Tín hiệu</th>
                </tr>
              </thead>
              <tbody>
                {missLanes.map((r) => (
                  <tr
                    key={`miss|${r.flightKey}|${r.dest}`}
                    className="cursor-pointer border-b border-rose-100/80 transition hover:bg-rose-100/40"
                    onClick={() => onSelectFlightDest?.(r.flightKey, r.dest)}
                  >
                    <td className="px-3.5 py-2 font-mono text-[12px] font-bold text-rose-950">
                      {r.flightKey}
                    </td>
                    <td className="px-3.5 py-2 font-semibold">{r.dest}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{r.lots}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums text-ui-text-muted">
                      {r.baselineLots}
                    </td>
                    <td className="px-3.5 py-2">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${SIGNAL_CLASS[r.signal]}`}
                      >
                        {SIGNAL_LABEL[r.signal]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
        <header className="border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
          <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">
            Flight × Dest · so baseline cùng DOW
          </h3>
          <p className="m-0 mt-0.5 text-[11px] text-ui-text-muted">
            Surge = hôm nay / max(TB cùng weekday, ε) · click để lọc bảng lô
          </p>
        </header>
        {ranked.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ui-text-muted">
            Không có chuyến trong ngày focus
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
                  <th className="px-3.5 py-2.5 font-bold">Chuyến</th>
                  <th className="px-3.5 py-2.5 font-bold">Dest</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Kg</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">TB DOW</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Surge</th>
                  <th className="px-3.5 py-2.5 font-bold">Tín hiệu</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr
                    key={`${r.flightKey}|${r.dest}`}
                    className="cursor-pointer border-b border-ui-border/45 transition hover:bg-teal-500/[0.04]"
                    onClick={() => onSelectFlightDest?.(r.flightKey, r.dest)}
                  >
                    <td className="px-3.5 py-2 font-mono text-[12px] font-bold text-ui-navy">
                      {r.flightKey}
                    </td>
                    <td className="px-3.5 py-2 font-semibold">{r.dest}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{r.lots}</td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {formatKgTotal(r.actualKg)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums text-ui-text-muted">
                      {r.baselineLots}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {r.surgeLots}×
                    </td>
                    <td className="px-3.5 py-2">
                      <span
                        className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${SIGNAL_CLASS[r.signal]}`}
                      >
                        {SIGNAL_LABEL[r.signal]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {nextWeek.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
          <header className="border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
            <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">Tuần tới</h3>
            <p className="m-0 mt-0.5 text-[11px] text-ui-text-muted">
              Top lane theo baseline cùng weekday · 7 ngày tới
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
                  <th className="px-3.5 py-2.5 font-bold">Ngày</th>
                  <th className="px-3.5 py-2.5 font-bold">Chuyến</th>
                  <th className="px-3.5 py-2.5 font-bold">Dest</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">TB lô</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">TB kg</th>
                  <th className="px-3.5 py-2.5 font-bold">Gợi ý</th>
                </tr>
              </thead>
              <tbody>
                {nextWeek.map((r) => (
                  <tr
                    key={`${r.ymd}|${r.flightKey}|${r.dest}`}
                    className="cursor-pointer border-b border-ui-border/45 transition hover:bg-teal-500/[0.04]"
                    onClick={() => onSelectFlightDest?.(r.flightKey, r.dest)}
                  >
                    <td className="px-3.5 py-2 tabular-nums">
                      <span className="font-medium text-ui-navy">{r.ymd}</span>
                      <span className="ml-1.5 text-[11px] text-ui-text-muted">
                        {r.dowLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 font-mono text-[12px] font-bold">
                      {r.flightKey}
                    </td>
                    <td className="px-3.5 py-2 font-semibold">{r.dest}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">
                      {r.baselineLots}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {formatKgTotal(r.baselineKg)}
                    </td>
                    <td className="max-w-[18rem] truncate px-3.5 py-2 text-[12px] text-ui-text-muted" title={r.insight}>
                      {r.insight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {forecast.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
          <header className="border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
            <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">
              Ước lượng 7 ngày
            </h3>
            <p
              className="m-0 mt-0.5 text-[11px] text-ui-text-muted"
              title="Naive · cùng DOW · không cam kết"
            >
              Naive · cùng DOW · không cam kết
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
                  <th className="px-3.5 py-2.5 font-bold">Ngày</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Kg</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">N mẫu</th>
                  <th className="px-3.5 py-2.5 font-bold">Tin cậy</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((r) => (
                  <tr
                    key={r.ymd}
                    className="border-b border-ui-border/45 last:border-0"
                  >
                    <td className="px-3.5 py-2 tabular-nums">
                      <span className="font-medium text-ui-navy">{r.ymd}</span>
                      <span className="ml-1.5 text-[11px] text-ui-text-muted">
                        {r.dowLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums">
                      {r.forecastLots}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {formatKgTotal(r.forecastKg)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums text-ui-text-muted">
                      {r.sampleDays}
                    </td>
                    <td className="px-3.5 py-2 text-[12px] font-semibold text-ui-navy">
                      {CONF_LABEL[r.confidence]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
