import type { Shipment, Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeWarehouseMetrics } from "../utils/warehouseMetrics";

const CARD_RING: Record<Warehouse, string> = {
  "TECS-TCS": "ring-sky-500/60",
  "TECS-SCSC": "ring-violet-500/60",
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
  /** Ẩn nút + trên thẻ — mobile dùng FAB. */
  hideAddButton?: boolean;
  className?: string;
}

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
          : `grid grid-cols-2 gap-1.5 xl:grid-cols-4 xl:gap-2 ${className}`
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
            className={`group relative shrink-0 rounded-xl text-left transition-all duration-200 ${
              compact ? "p-1.5" : "p-2"
            } ${
              isActive
                ? `bg-ui-surface ring-2 ${CARD_RING[wh]}`
                : "border border-ui-border bg-ui-surface shadow-ui-sm hover:bg-ui-surface-muted"
            } ${hasSearchHit && !isActive ? "ring-1 ring-ui-primary/35" : ""}`}
          >
            {onAddRow && !hideAddButton ? (
              <button
                type="button"
                title={`Thêm lô ${warehouseLabel[wh]}`}
                aria-label={`Thêm lô ${warehouseLabel[wh]}`}
                onClick={() => onAddRow(wh)}
                className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-apple-blue/40 bg-apple-blue text-[13px] font-bold leading-none text-white shadow-sm transition hover:bg-apple-blue-hover active:scale-95"
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(wh)}
              className="block w-full rounded-xl text-left active:scale-[0.99]"
            >
              <p
                className={`font-bold uppercase tracking-wide text-dashboard-muted ${
                  compact ? "pr-5 text-[9px]" : "pr-7 text-[10px]"
                }`}
              >
                {warehouseLabel[wh]}
              </p>
              <div
                className={`grid grid-cols-3 ${compact ? "mt-1 gap-0.5" : "mt-1 gap-1"}`}
              >
                <Metric
                  label="Lô"
                  value={m.lots}
                  large={isActive}
                  compact={compact}
                />
                <Metric
                  label="Kiện"
                  value={m.pcs}
                  large={isActive}
                  compact={compact}
                />
                <Metric
                  label="Kg"
                  value={formatKgTotal(m.kg)}
                  large={isActive}
                  compact={compact}
                />
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
      <p className="text-[8px] font-semibold uppercase tracking-wide text-dashboard-muted">
        {label}
      </p>
      <p
        className={`font-semibold tabular-nums leading-tight text-dashboard-primary ${
          large
            ? compact
              ? "text-sm"
              : "text-sm"
            : compact
              ? "text-[11px]"
              : "text-xs"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
