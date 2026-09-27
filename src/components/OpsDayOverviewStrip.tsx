import { useMemo } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeOpsDayOverview } from "../utils/opsDayOverview";
import { countAttentionRows } from "../utils/opsAttention";
import { WarehouseGridPicker } from "./WarehouseGridPicker";

type Props = {
  selectedYmd: string;
  rows: readonly Shipment[];
  allRows?: readonly Shipment[];
  activeWarehouse: Warehouse;
  onSelectWarehouse: (wh: Warehouse) => void;
  highlightWarehouses?: readonly Warehouse[];
  filtersActive?: boolean;
  variant: "desktop" | "mobile";
  embedded?: boolean;
  attentionActive?: boolean;
  onSelectAttention?: () => void;
};

function CompactKpi({
  label,
  value,
  active = false,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  tone?: "default" | "danger" | "success";
  onClick?: () => void;
}) {
  const isDanger = tone === "danger";
  const isSuccess = tone === "success";
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`glide-pill inline-flex min-h-9 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1 text-center select-none ${
        onClick ? "cursor-pointer" : ""
      } ${
        active
          ? isDanger
            ? "border-red-500 bg-red-500/15 shadow-sm text-red-800"
            : isSuccess
              ? "border-emerald-500 bg-emerald-500/15 shadow-sm text-emerald-800"
              : "border-teal-500/45 bg-teal-500/10 shadow-sm"
          : isDanger
            ? "border-red-300 bg-red-50/70 text-red-800 hover:bg-red-100 hover:border-red-400"
            : isSuccess
              ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-100/60"
              : "border-ui-border/80 bg-ui-surface hover:border-teal-500/30 hover:shadow-ui-sm"
      }`}
      title={`${label}: ${value}`}
    >
      <span
        className={`text-2xs font-bold uppercase leading-none tracking-wide ${
          isDanger ? "text-red-700" : isSuccess ? "text-emerald-700" : "text-ui-text-muted"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${
          isDanger ? "text-red-800 font-bold" : isSuccess ? "text-emerald-800" : "text-ui-navy"
        }`}
      >
        {value}
      </span>
    </Tag>
  );
}

/** KPI ngày + chip kho — desktop: 3 KPI cards + chips + Cần xử lý nếu có. */
export function OpsDayOverviewStrip({
  selectedYmd,
  rows,
  allRows,
  activeWarehouse,
  onSelectWarehouse,
  highlightWarehouses = [],
  filtersActive = false,
  variant,
  embedded = false,
  attentionActive = false,
  onSelectAttention,
}: Props) {
  const { totals } = useMemo(() => computeOpsDayOverview(rows), [rows]);
  const attentionCount = useMemo(
    () => countAttentionRows(rows as Shipment[], (allRows ?? rows) as Shipment[], selectedYmd),
    [rows, allRows, selectedYmd]
  );
  const isMobile = variant === "mobile";
  const kgLabel = formatKgTotal(totals.kg);
  const filterHint = filtersActive ? "*" : "";

  if (!isMobile && embedded) {
    return (
      <div
        data-testid="ops-day-overview"
        className="flex min-w-0 shrink-0 items-center gap-1.5"
      >
        <CompactKpi label={`Lô${filterHint}`} value={totals.lots} active={filtersActive} />
        <CompactKpi label="PCS" value={totals.pcs} />
        <CompactKpi label="KG" value={kgLabel} />
        <CompactKpi
          label="Cần xử lý"
          value={attentionCount > 0 ? `⚠ ${attentionCount}` : "0 ✓"}
          tone={attentionCount > 0 ? "danger" : "success"}
          active={attentionActive}
          onClick={onSelectAttention}
        />
        <span className="mx-0.5 h-5 w-px shrink-0 bg-ui-border/70" aria-hidden />
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
          isMobile && !embedded
            ? "min-h-10 border border-ui-border/70 bg-ui-surface shadow-ui-sm"
            : "h-8 bg-ui-surface/90"
        }`}
        title={`Tổng ngày Ops${filtersActive ? " (sau lọc)" : ""}`}
      >
        <span className="text-2xs font-bold uppercase tracking-wide text-ui-text-muted">
          Tổng{filterHint}
        </span>
        <span className="whitespace-nowrap font-mono text-2xs font-bold tabular-nums text-ui-navy">
          {totals.lots}
          <span className="mx-0.5 text-ui-border">·</span>
          {totals.pcs}
          <span className="mx-0.5 text-ui-border">·</span>
          {kgLabel}
          <span className="mx-0.5 text-ui-border">·</span>
          {attentionCount > 0 ? (
            <span className="text-red-700 font-bold">⚠ {attentionCount}</span>
          ) : (
            <span className="text-emerald-700 font-semibold">0 ✓</span>
          )}
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
        className="min-w-0 flex-1 justify-end"
      />
    </div>
  );
}
