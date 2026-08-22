import type { Shipment, Warehouse } from "../types/shipment";
import {
  WAREHOUSE_ORDER,
  opsTeamOf,
  warehouseLabel,
  type OpsTeam,
} from "../constants/warehouses";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeWarehouseMetrics } from "../utils/warehouseMetrics";

const CARD_RING: Record<Warehouse, string> = {
  "TECS-TCS": "ring-sky-500/60",
  "TECS-SCSC": "ring-violet-500/60",
  TCS: "ring-cyan-500/60",
  SCSC: "ring-fuchsia-500/60",
};

const CARD_ACCENT: Record<Warehouse, string> = {
  "TECS-TCS": "border-l-sky-500",
  "TECS-SCSC": "border-l-violet-500",
  TCS: "border-l-cyan-500",
  SCSC: "border-l-fuchsia-500",
};

const TEAM_CHIP: Record<OpsTeam, { label: string; className: string }> = {
  TECS: {
    label: "TECS",
    className: "bg-teal-50 text-teal-800 ring-teal-200/90",
  },
  TCS: {
    label: "TCS",
    className: "bg-sky-50 text-sky-800 ring-sky-200/90",
  },
  SCSC: {
    label: "SCSC",
    className: "bg-violet-50 text-violet-800 ring-violet-200/90",
  },
};

interface Props {
  rows: readonly Shipment[];
  active: Warehouse;
  onSelect: (wh: Warehouse) => void;
  onAddRow?: (wh: Warehouse) => void;
  highlightWarehouses?: readonly Warehouse[];
  /** Mobile 2×2 — desktop mặc định 1 hàng 4 thẻ siêu gọn. */
  compact?: boolean;
  hideAddButton?: boolean;
  className?: string;
}

/**
 * Chọn kho — desktop: 1 hàng metric ngang (thấp); mobile: lưới 2×2.
 */
export function WarehouseGridPicker({
  rows,
  active,
  onSelect,
  onAddRow,
  highlightWarehouses = [],
  compact = false,
  hideAddButton = false,
  className = "",
}: Props) {
  const metrics = computeWarehouseMetrics(rows);

  return (
    <div
      className={
        compact
          ? `grid grid-cols-2 gap-1.5 ${className}`
          : `grid grid-cols-2 gap-1.5 sm:grid-cols-4 ${className}`
      }
      role="tablist"
      aria-label="Chọn kho"
    >
      {WAREHOUSE_ORDER.map((wh) => {
        const m = metrics[wh];
        const isActive = active === wh;
        const hasSearchHit = highlightWarehouses.includes(wh);
        const team = opsTeamOf(wh);
        const chip = TEAM_CHIP[team];
        const kg = formatKgTotal(m.kg);

        return (
          <div
            key={wh}
            role="tab"
            aria-selected={isActive}
            className={`group relative min-w-0 overflow-hidden rounded-xl border-l-[3px] text-left transition-all duration-150 ${CARD_ACCENT[wh]} ${
              compact ? "px-1.5 py-1" : "px-2 py-1.5"
            } ${
              isActive
                ? `bg-ui-surface shadow-ui-md ring-2 ${CARD_RING[wh]}`
                : "border border-ui-border/80 border-l-[3px] bg-ui-surface/90 hover:bg-ui-surface hover:shadow-ui-sm"
            } ${hasSearchHit && !isActive ? "ring-1 ring-ui-primary/40" : ""}`}
          >
            {onAddRow && !hideAddButton ? (
              <button
                type="button"
                title={`Thêm lô ${warehouseLabel[wh]}`}
                aria-label={`Thêm lô ${warehouseLabel[wh]}`}
                onClick={() => onAddRow(wh)}
                className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ui-primary text-[11px] font-bold leading-none text-white shadow-ui-sm transition hover:bg-ui-primary-hover active:scale-95"
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(wh)}
              className={`block w-full rounded-md text-left active:scale-[0.99] ${
                compact ? "min-h-11" : ""
              }`}
            >
              <div className={`flex min-w-0 items-center gap-1 ${compact ? "pr-5" : "pr-5"}`}>
                <span
                  className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[7px] font-bold uppercase tracking-wide ring-1 ring-inset ${chip.className}`}
                >
                  {chip.label}
                </span>
                <p className="min-w-0 truncate text-[10px] font-extrabold tracking-wide text-ui-navy">
                  {warehouseLabel[wh]}
                </p>
              </div>
              <p
                className={`mt-0.5 truncate font-mono tabular-nums text-ui-navy ${
                  isActive ? "text-[11px] font-extrabold" : "text-[10px] font-semibold"
                } ${compact || !hideAddButton ? "pr-5" : ""}`}
                title={`Lô ${m.lots} · Kiện ${m.pcs} · Kg ${kg}`}
              >
                <span className="text-ui-text-muted">Lô</span> {m.lots}
                <span className="mx-0.5 text-ui-border">·</span>
                <span className="text-ui-text-muted">Kiện</span> {m.pcs}
                <span className="mx-0.5 text-ui-border">·</span>
                <span className="text-ui-text-muted">Kg</span> {kg}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );
}
