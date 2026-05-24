import type { Shipment, Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import { computeWarehouseMetrics } from "../utils/warehouseMetrics";

const CARD_RING: Record<Warehouse, string> = {
  "TECS-TCS":
    "ring-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.18)] dark:ring-sky-400/40 dark:shadow-[0_0_24px_rgba(56,189,248,0.12)]",
  "TECS-SCSC":
    "ring-violet-400/50 shadow-[0_0_20px_rgba(167,139,250,0.18)] dark:ring-violet-400/40 dark:shadow-[0_0_24px_rgba(167,139,250,0.12)]",
  "KHO-TCS":
    "ring-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.16)] dark:ring-amber-400/35 dark:shadow-[0_0_24px_rgba(251,191,36,0.1)]",
  "KHO-SCSC":
    "ring-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.18)] dark:ring-emerald-400/40 dark:shadow-[0_0_24px_rgba(52,211,153,0.12)]",
};

interface Props {
  rows: readonly Shipment[];
  active: Warehouse;
  onSelect: (wh: Warehouse) => void;
  /** Thêm dòng trống vào kho — nút + trên thẻ (1 click tại chỗ). */
  onAddRow?: (wh: Warehouse) => void;
  /** Kho có kết quả tìm kiếm — viền phụ. */
  highlightWarehouses?: readonly Warehouse[];
  /** Dải ngang cuộn — dùng trên mobile. */
  compact?: boolean;
  className?: string;
}

export function WarehouseGridPicker({
  rows,
  active,
  onSelect,
  onAddRow,
  highlightWarehouses = [],
  compact = false,
  className = "",
}: Props) {
  const metrics = computeWarehouseMetrics(rows);

  return (
    <div
      className={
        compact
          ? `flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] ${className}`
          : `grid grid-cols-2 gap-2 xl:grid-cols-4 xl:gap-3 ${className}`
      }
      role="tablist"
      aria-label="Chọn kho"
    >
      {WAREHOUSE_ORDER.map((wh) => {
        const m = metrics[wh];
        const isActive = active === wh;
        const hasSearchHit = highlightWarehouses.includes(wh);

        return (
          <div
            key={wh}
            role="tab"
            aria-selected={isActive}
            className={`group relative shrink-0 rounded-2xl text-left transition-all duration-200 ${
              compact ? "min-w-[8.5rem] p-2.5" : "p-3"
            } ${
              isActive
                ? `bg-white ring-2 ${CARD_RING[wh]} dark:bg-dashboard-surface-dark`
                : "bg-white/80 shadow-dashboard-card hover:bg-white hover:shadow-dashboard-card-hover dark:bg-dashboard-surface-dark/80 dark:hover:bg-dashboard-surface-dark"
            } ${hasSearchHit && !isActive ? "ring-1 ring-apple-blue/30" : ""}`}
          >
            {onAddRow ? (
              <button
                type="button"
                title={`Thêm lô ${warehouseLabel[wh]}`}
                aria-label={`Thêm lô ${warehouseLabel[wh]}`}
                onClick={() => onAddRow(wh)}
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-apple-blue/40 bg-apple-blue text-[15px] font-bold leading-none text-white shadow-sm transition hover:bg-apple-blue-hover active:scale-95 dark:border-sky-400/40"
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(wh)}
              className="block w-full rounded-2xl text-left active:scale-[0.99]"
            >
              <p
                className={`pr-8 font-bold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark ${
                  compact ? "text-[10px]" : "text-[11px]"
                }`}
              >
                {warehouseLabel[wh]}
              </p>
              <div className={`grid grid-cols-3 gap-2 ${compact ? "mt-1.5 gap-1" : "mt-2"}`}>
                <Metric label="Lô" value={m.lots} large={isActive} compact={compact} />
                <Metric label="Kiện" value={m.pcs} large={isActive} compact={compact} />
                <Metric label="Kg" value={m.kg.toLocaleString()} large={isActive} compact={compact} />
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Metric({
  label,
  value,
  large,
  compact,
}: {
  label: string;
  value: string | number;
  large?: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark">
        {label}
      </p>
      <p
        className={`font-semibold tabular-nums text-dashboard-primary dark:text-dashboard-primary-dark ${
          large ? (compact ? "text-base" : "text-lg") : compact ? "text-xs" : "text-sm"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
