import { useMemo } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeOpsDayOverview } from "../utils/opsDayOverview";
import { WarehouseGridPicker } from "./WarehouseGridPicker";

type Props = {
  selectedYmd: string;
  rows: readonly Shipment[];
  activeWarehouse: Warehouse;
  onSelectWarehouse: (wh: Warehouse) => void;
  highlightWarehouses?: readonly Warehouse[];
  filtersActive?: boolean;
  variant: "desktop" | "mobile";
  embedded?: boolean;
};

function KpiChip({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string | number;
  active?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-w-[5.5rem] shrink-0 flex-col rounded-xl border px-4 py-2.5 text-left shadow-ui-sm transition ${
        active
          ? "border-teal-500/45 bg-teal-500/10 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.12)]"
          : "border-ui-border/90 bg-ui-surface hover:border-teal-500/30 hover:shadow-ui-md"
      }`}
    >
      <span className="font-mono text-lg font-semibold tabular-nums leading-tight text-ui-navy">
        {value}
      </span>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
        {label}
      </span>
    </span>
  );
}

/** KPI ngày + chip kho — desktop: 3 KPI cards + chips. */
export function OpsDayOverviewStrip({
  rows,
  activeWarehouse,
  onSelectWarehouse,
  highlightWarehouses = [],
  filtersActive = false,
  variant,
  embedded = false,
}: Props) {
  const { totals } = useMemo(() => computeOpsDayOverview(rows), [rows]);
  const isMobile = variant === "mobile";
  const kgLabel = formatKgTotal(totals.kg);
  const filterHint = filtersActive ? "*" : "";

  if (!isMobile && embedded) {
    return (
      <div
        data-testid="ops-day-overview"
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        <KpiChip label={`Lô${filterHint}`} value={totals.lots} active={filtersActive} />
        <KpiChip label="PCS" value={totals.pcs} />
        <KpiChip label="KG" value={kgLabel} />
        <WarehouseGridPicker
          rows={rows}
          active={activeWarehouse}
          onSelect={onSelectWarehouse}
          highlightWarehouses={highlightWarehouses}
          chips
          denseChips
          touchTargets={false}
          hideAddButton
          className="min-w-0 shrink-0"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="ops-day-overview"
      className={`flex min-w-0 items-center gap-1 ${
        embedded
          ? "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          : isMobile
            ? "flex-col items-stretch gap-1"
            : "rounded-xl bg-ui-background/60 p-1 ring-1 ring-ui-border/40"
      }`}
    >
      <div
        data-testid="ops-day-pulse"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 ring-1 ring-ui-border/60 ${
          isMobile && !embedded ? "min-h-10 border border-ui-border/70 bg-ui-surface shadow-ui-sm" : "h-8 bg-ui-surface/90"
        }`}
        title={`Tổng ngày Ops${filtersActive ? " (sau lọc)" : ""}`}
      >
        <span className="text-[9px] font-extrabold uppercase tracking-wide text-ui-text-muted">
          Tổng{filterHint}
        </span>
        <span className="whitespace-nowrap font-mono text-[10px] font-bold tabular-nums text-ui-navy">
          {totals.lots}
          <span className="mx-0.5 text-ui-border">·</span>
          {totals.pcs}
          <span className="mx-0.5 text-ui-border">·</span>
          {kgLabel}
        </span>
      </div>

      <WarehouseGridPicker
        rows={rows}
        active={activeWarehouse}
        onSelect={onSelectWarehouse}
        highlightWarehouses={highlightWarehouses}
        chips
        denseChips
        touchTargets={isMobile}
        hideAddButton
        className="min-w-0 shrink-0"
      />
    </div>
  );
}
