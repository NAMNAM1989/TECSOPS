import type { OpsStatsAlert } from "../../utils/opsStatsIntelligence";

const KIND_LABEL: Record<OpsStatsAlert["kind"], string> = {
  missing_pcs: "Thiếu kiện",
  missing_kg: "Thiếu kg",
  missing_flight: "Thiếu chuyến",
  pending: "Booking",
  cutoff_per: "Cutoff PER",
  flight_date_skew: "Lệch ngày bay",
};

type Props = {
  alerts: readonly OpsStatsAlert[];
  onSelectAwb?: (awb: string) => void;
  onOpenOps?: (alert: OpsStatsAlert) => void;
};

export function OpsStatsAlertList({ alerts, onSelectAwb, onOpenOps }: Props) {
  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-ui-border/80 bg-ui-surface px-4 py-10 text-center shadow-ui-sm">
        <p className="m-0 text-sm font-semibold text-emerald-800">Không có cảnh báo trong kỳ</p>
        <p className="m-0 mt-1 text-[12px] text-ui-text-muted">
          Không phát hiện thiếu pcs/kg/chuyến, PER, PENDING hay lệch flightDate.
        </p>
      </section>
    );
  }

  const warn = alerts.filter((a) => a.severity === "warn").length;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-ui-border/80 bg-ui-surface shadow-ui-sm"
      data-testid="stats-alert-list"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border/60 px-3.5 py-2.5 sm:px-4">
        <h3 className="m-0 text-[13px] font-extrabold text-ui-navy">Cảnh báo vận hành</h3>
        <p className="m-0 text-[11px] text-ui-text-muted">
          {alerts.length} mục · {warn} mức cảnh báo
        </p>
      </header>
      <ul className="m-0 max-h-[28rem] list-none divide-y divide-ui-border/50 overflow-y-auto p-0">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start gap-2 px-3.5 py-2.5 sm:px-4">
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-wrap items-start gap-2 text-left transition hover:opacity-90"
              onClick={() => onSelectAwb?.(a.awb)}
            >
              <span
                className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  a.severity === "warn"
                    ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200/80"
                    : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
                }`}
              >
                {KIND_LABEL[a.kind]}
              </span>
              <span className="min-w-0 flex-1 text-[13px] text-ui-text">
                <span className="font-shipment-data font-bold text-ui-awb">{a.awb}</span>
                <span className="text-ui-text-muted"> · {a.sessionDate || "—"}</span>
                <span className="mt-0.5 block text-[12px] text-ui-text-muted">{a.message}</span>
              </span>
            </button>
            {onOpenOps ? (
              <button
                type="button"
                className="shrink-0 rounded-lg border border-ui-border/80 px-2 py-1 text-[11px] font-bold text-ui-navy hover:bg-slate-50"
                onClick={() => onOpenOps(a)}
              >
                Mở Ops
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
