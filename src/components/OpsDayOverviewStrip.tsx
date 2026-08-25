import { useMemo } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import { KpiStat } from "../ui";
import { formatOpsWorkDateYmd } from "../utils/opsDateFormat";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeOpsDayOverview } from "../utils/opsDayOverview";
import { WarehouseGridPicker } from "./WarehouseGridPicker";

type Props = {
  selectedYmd: string;
  /** Lô đã lọc ngày phiên + text/status — cùng nguồn DayPulse / chip. */
  rows: readonly Shipment[];
  activeWarehouse: Warehouse;
  onSelectWarehouse: (wh: Warehouse) => void;
  highlightWarehouses?: readonly Warehouse[];
  /** Text / status / ngày bay đang lọc — nhãn ngắn trên DayPulse. */
  filtersActive?: boolean;
  variant: "desktop" | "mobile";
};

/**
 * Overview Ops `#/`: DayPulse (Tổng ngày) + 4 chip/tile kho luôn hiện.
 * Không đụng CTA Booking / Search / thanh Ảnh báo cáo / overflow Ext·Công cụ.
 */
export function OpsDayOverviewStrip({
  selectedYmd,
  rows,
  activeWarehouse,
  onSelectWarehouse,
  highlightWarehouses = [],
  filtersActive = false,
  variant,
}: Props) {
  const { totals } = useMemo(() => computeOpsDayOverview(rows), [rows]);
  const dateLabel = formatOpsWorkDateYmd(selectedYmd);
  const isMobile = variant === "mobile";

  return (
    <div
      data-testid="ops-day-overview"
      className={
        isMobile
          ? "space-y-1"
          : "flex min-w-0 items-stretch gap-1.5"
      }
    >
      <DayPulse
        dateLabel={dateLabel}
        lots={totals.lots}
        pcs={totals.pcs}
        kg={totals.kg}
        filtersActive={filtersActive}
        compact={isMobile}
      />
      <WarehouseGridPicker
        rows={rows}
        active={activeWarehouse}
        onSelect={onSelectWarehouse}
        highlightWarehouses={highlightWarehouses}
        chips={isMobile}
        hideAddButton
        className={isMobile ? "min-w-0" : "min-w-0 flex-1"}
      />
    </div>
  );
}

function DayPulse({
  dateLabel,
  lots,
  pcs,
  kg,
  filtersActive,
  compact,
}: {
  dateLabel: string;
  lots: number;
  pcs: number;
  kg: number;
  filtersActive: boolean;
  compact: boolean;
}) {
  const kgLabel = formatKgTotal(kg);
  const filterHint = filtersActive ? " · sau lọc" : "";

  return (
    <div
      data-testid="ops-day-pulse"
      className={
        compact
          ? "flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-ui-border/80 bg-ui-surface px-2.5 shadow-ui-sm"
          : "flex shrink-0 items-center gap-2 rounded-xl border border-ui-border/80 bg-ui-surface px-2.5 py-1 shadow-ui-sm"
      }
      title={`Tổng ngày Ops ${dateLabel}${filterHint} — số từ lô đang mở, không phải SoT`}
    >
      <div className="min-w-0 shrink-0 leading-tight">
        <p className="truncate text-[10px] font-extrabold tabular-nums text-ui-navy">
          {dateLabel}
        </p>
        <p className="text-[8px] font-bold uppercase tracking-wide text-ui-text-muted">
          Tổng ngày{filterHint}
          <span className="ml-1 font-semibold normal-case tracking-normal">Ops</span>
        </p>
      </div>
      {compact ? (
        <p className="min-w-0 truncate font-mono text-[11px] font-bold tabular-nums text-ui-navy">
          <span className="text-[9px] font-semibold text-ui-text-muted">Lô</span> {lots}
          <span className="mx-0.5 text-ui-border">·</span>
          <span className="text-[9px] font-semibold text-ui-text-muted">Kiện</span> {pcs}
          <span className="mx-0.5 text-ui-border">·</span>
          <span className="text-[9px] font-semibold text-ui-text-muted">Kg</span> {kgLabel}
        </p>
      ) : (
        <div className="flex items-center gap-1">
          <KpiStat label="Lô" value={lots} />
          <KpiStat label="Kiện" value={pcs} />
          <KpiStat label="Kg" value={kgLabel} />
        </div>
      )}
    </div>
  );
}
