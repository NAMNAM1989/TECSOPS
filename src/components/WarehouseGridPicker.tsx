import type { Shipment, Warehouse } from "../types/shipment";
import {
  OPS_TEAM_ORDER,
  opsTeamLabel,
  warehouseLabel,
  warehousesOfOpsTeam,
} from "../constants/warehouses";
import { formatKgTotal } from "../utils/formatKgTotal";
import { computeWarehouseMetrics } from "../utils/warehouseMetrics";

const CARD_RING: Record<Warehouse, string> = {
  "TECS-TCS": "ring-sky-500/60",
  "TECS-SCSC": "ring-violet-500/60",
  TCS: "ring-cyan-500/60",
  SCSC: "ring-fuchsia-500/60",
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
          ? `flex flex-col gap-2 ${className}`
          : `flex flex-col gap-2.5 ${className}`
      }
      role="tablist"
      aria-label="Chọn kho theo đội OPS"
    >
      {OPS_TEAM_ORDER.map((team) => {
        const warehouses = warehousesOfOpsTeam(team);
        return (
          <section key={team} className="min-w-0" aria-label={opsTeamLabel[team]}>
            <p
              className={`mb-1 font-bold uppercase tracking-wide text-dashboard-muted ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
            >
              {opsTeamLabel[team]}
              {team === "TECS" ? (
                <span className="ml-1 font-medium normal-case tracking-normal text-zinc-400">
                  · nhóm TECS–TCS / TECS–SCSC
                </span>
              ) : null}
            </p>
            <div
              className={
                warehouses.length > 1
                  ? compact
                    ? "grid grid-cols-2 gap-1.5"
                    : "grid grid-cols-2 gap-1.5 lg:gap-2"
                  : compact
                    ? "grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                    : "grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2"
              }
            >
              {warehouses.map((wh) => {
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
          </section>
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
    <div className="min-w-0">
      <p
        className={`truncate font-medium uppercase tracking-wide text-dashboard-muted ${
          compact ? "text-[8px]" : "text-[9px]"
        }`}
      >
        {label}
      </p>
      <p
        className={`truncate font-bold tabular-nums text-dashboard-ink ${
          large
            ? compact
              ? "text-sm"
              : "text-base"
            : compact
              ? "text-xs"
              : "text-sm"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
