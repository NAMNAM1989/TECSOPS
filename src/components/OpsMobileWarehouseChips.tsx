import type { Shipment, Warehouse } from "../types/shipment";
import { warehouseLabel, WAREHOUSE_ORDER } from "../constants/warehouses";
import { computeWarehouseMetrics } from "../utils/warehouseMetrics";

const CHIP_RING: Record<Warehouse, string> = {
  "TECS-TCS": "ring-sky-400/55 dark:ring-sky-400/40",
  "TECS-SCSC": "ring-violet-400/55 dark:ring-violet-400/40",
};

interface Props {
  rows: readonly Shipment[];
  active: Warehouse;
  onSelect: (wh: Warehouse) => void;
  highlightWarehouses?: readonly Warehouse[];
}

function compactKg(kg: number): string {
  if (kg >= 10000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return kg.toLocaleString();
}

/** Chọn kho 1 dòng — thay thẻ metric lớn trên mobile. */
export function OpsMobileWarehouseChips({
  rows,
  active,
  onSelect,
  highlightWarehouses = [],
}: Props) {
  const metrics = computeWarehouseMetrics(rows);

  return (
    <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Chọn kho">
      {WAREHOUSE_ORDER.map((wh) => {
        const m = metrics[wh];
        const isActive = active === wh;
        const hasSearchHit = highlightWarehouses.includes(wh);

        return (
          <button
            key={wh}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(wh)}
            className={`rounded-lg border px-1.5 py-1 text-left transition active:scale-[0.99] ${
              isActive
                ? `border-transparent bg-white ring-1 ${CHIP_RING[wh]} dark:bg-dashboard-surface-dark`
                : "border-black/[0.05] bg-white/70 dark:border-white/[0.06] dark:bg-dashboard-surface-dark/70"
            } ${hasSearchHit && !isActive ? "ring-1 ring-apple-blue/35" : ""}`}
          >
            <p className="truncate text-[8px] font-bold uppercase tracking-wide text-dashboard-muted dark:text-dashboard-muted-dark">
              {warehouseLabel[wh]}
            </p>
            <p className="mt-px truncate text-[10px] font-bold tabular-nums leading-none text-dashboard-primary dark:text-dashboard-primary-dark">
              {m.lots}
              <span className="mx-0.5 font-normal text-dashboard-muted dark:text-dashboard-muted-dark">·</span>
              {m.pcs}
              <span className="mx-0.5 font-normal text-dashboard-muted dark:text-dashboard-muted-dark">·</span>
              {compactKg(m.kg)}
              <span className="ml-0.5 text-[8px] font-semibold uppercase text-dashboard-muted dark:text-dashboard-muted-dark">
                kg
              </span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
