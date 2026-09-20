import { formatKgTotal } from "../../utils/formatKgTotal";
import type { CustomerDestCell, ShareRow } from "../../utils/opsStatsIntelligence";
import type { ShareSparkPoint } from "../../utils/opsStatsForecast";
import { ShareSparkline } from "./ShareSparkline";

type Props = {
  customerShare: { rows: ShareRow[]; hhiKg: number };
  destShare: { rows: ShareRow[]; hhiKg: number };
  airlineShare: { rows: ShareRow[]; hhiKg: number };
  customerDestTop: readonly CustomerDestCell[];
  sparkByCustomerKey?: Record<string, ShareSparkPoint[]>;
  sparkByDestKey?: Record<string, ShareSparkPoint[]>;
  onSelectCustomer?: (key: string) => void;
  onSelectDest?: (dest: string) => void;
};

function ShareTable({
  title,
  subtitle,
  rows,
  sparkByKey,
  onSelect,
}: {
  title: string;
  subtitle: string;
  rows: readonly ShareRow[];
  sparkByKey?: Record<string, ShareSparkPoint[]>;
  onSelect?: (key: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
      <header className="border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
        <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">{title}</h3>
        <p className="m-0 mt-0.5 text-[11px] text-ui-text-muted">{subtitle}</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ui-text-muted">Không có dữ liệu</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
                <th className="px-3.5 py-2.5 font-bold">Nhóm</th>
                <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
                <th className="px-3.5 py-2.5 text-right font-bold">Kg</th>
                <th className="px-3.5 py-2.5 text-right font-bold">% lô</th>
                <th className="px-3.5 py-2.5 text-right font-bold">% kg</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => {
                const spark = sparkByKey?.[r.key];
                return (
                  <tr
                    key={r.key}
                    className={`border-b border-ui-border/45 transition last:border-0 ${
                      onSelect ? "cursor-pointer hover:bg-teal-500/[0.04]" : ""
                    }`}
                    onClick={() => onSelect?.(r.key)}
                  >
                    <td
                      className="max-w-[14rem] px-3.5 py-2 font-medium text-ui-navy"
                      title={r.label}
                    >
                      <span className="inline-flex max-w-full items-center gap-2">
                        <span className="truncate">{r.label}</span>
                        {spark && spark.length >= 4 ? (
                          <ShareSparkline points={spark} />
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{r.lots}</td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {formatKgTotal(r.actualKg)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{r.shareLots}%</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{r.shareKg}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OpsStatsMarketPanel({
  customerShare,
  destShare,
  airlineShare,
  customerDestTop,
  sparkByCustomerKey,
  sparkByDestKey,
  onSelectCustomer,
  onSelectDest,
}: Props) {
  return (
    <div className="space-y-3" data-testid="stats-market-panel">
      <div className="flex flex-wrap gap-2 px-0.5 text-[11px] text-ui-text-muted">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800 ring-1 ring-slate-200/80">
          HHI khách (kg): {customerShare.hhiKg.toFixed(3)}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800 ring-1 ring-slate-200/80">
          HHI dest: {destShare.hhiKg.toFixed(3)}
        </span>
        <span className="text-ui-text-muted">
          Share nội bộ TECSOPS · HHI gần 1 = tập trung cao
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ShareTable
          title="Share theo khách"
          subtitle="Top theo kg · click lọc"
          rows={customerShare.rows}
          sparkByKey={sparkByCustomerKey}
          onSelect={onSelectCustomer}
        />
        <ShareTable
          title="Share theo dest"
          subtitle="Top theo kg · click lọc"
          rows={destShare.rows}
          sparkByKey={sparkByDestKey}
          onSelect={onSelectDest}
        />
        <ShareTable
          title="Share theo hãng (prefix)"
          subtitle="2 ký tự đầu mã chuyến"
          rows={airlineShare.rows}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm">
        <header className="border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
          <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">Ai đang chiếm tuyến</h3>
          <p className="m-0 mt-0.5 text-[11px] text-ui-text-muted">Top customer × dest theo kg</p>
        </header>
        {customerDestTop.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ui-text-muted">Không có dữ liệu</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-ui-border/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-ui-text-muted">
                  <th className="px-3.5 py-2.5 font-bold">Khách</th>
                  <th className="px-3.5 py-2.5 font-bold">Dest</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Lô</th>
                  <th className="px-3.5 py-2.5 text-right font-bold">Kg</th>
                </tr>
              </thead>
              <tbody>
                {customerDestTop.map((c) => (
                  <tr
                    key={`${c.customerKey}|${c.dest}`}
                    className="border-b border-ui-border/45 last:border-0"
                  >
                    <td className="max-w-[14rem] truncate px-3.5 py-2 font-medium" title={c.customerLabel}>
                      {c.customerLabel}
                    </td>
                    <td className="px-3.5 py-2 font-semibold text-ui-navy">{c.dest}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{c.lots}</td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">
                      {formatKgTotal(c.actualKg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
