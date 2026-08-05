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
  "TECS-TCS": "ring-sky-500/55",
  "TECS-SCSC": "ring-violet-500/55",
  TCS: "ring-cyan-500/55",
  SCSC: "ring-fuchsia-500/55",
};

/** Chip đội OPS trên thẻ — ngắn, không chiếm hàng riêng. */
const TEAM_CHIP: Record<OpsTeam, { label: string; className: string }> = {
  TECS: {
    label: "TECS",
    className: "bg-teal-50 text-teal-700 ring-teal-200/80",
  },
  TCS: {
    label: "TCS",
    className: "bg-sky-50 text-sky-700 ring-sky-200/80",
  },
  SCSC: {
    label: "SCSC",
    className: "bg-violet-50 text-violet-700 ring-violet-200/80",
  },
};

interface Props {
  rows: readonly Shipment[];
  active: Warehouse;
  onSelect: (wh: Warehouse) => void;
  /** Thêm dòng trống vào kho — nút + trên thẻ (1 click tại chỗ). */
  onAddRow?: (wh: Warehouse) => void;
  /** Kho có kết quả tìm kiếm — viền phụ. */
  highlightWarehouses?: readonly Warehouse[];
  /** Dải gọn — dùng trên mobile. */
  compact?: boolean;
  /** Ẩn nút + trên thẻ — mobile dùng FAB. */
  hideAddButton?: boolean;
  className?: string;
}

/**
 * Chọn kho: 4 thẻ một hàng (desktop) / 2×2 (mobile).
 * Đội OPS hiện bằng chip nhỏ trên thẻ — không xếp 3 khối dọc gây khoảng trống.
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
          : `grid grid-cols-2 gap-2 lg:grid-cols-4 ${className}`
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

        return (
          <div
            key={wh}
            role="tab"
            aria-selected={isActive}
            className={`group relative min-w-0 rounded-xl text-left transition-all duration-150 ${
              compact ? "px-2 py-1.5" : "px-2.5 py-2"
            } ${
              isActive
                ? `bg-ui-surface shadow-ui-sm ring-2 ${CARD_RING[wh]}`
                : "border border-ui-border/90 bg-ui-surface shadow-ui-sm hover:border-ui-border hover:bg-ui-surface-muted"
            } ${hasSearchHit && !isActive ? "ring-1 ring-ui-primary/35" : ""}`}
          >
            {onAddRow && !hideAddButton ? (
              <button
                type="button"
                title={`Thêm lô ${warehouseLabel[wh]}`}
                aria-label={`Thêm lô ${warehouseLabel[wh]}`}
                onClick={() => onAddRow(wh)}
                className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-ui-primary/35 bg-ui-primary text-[13px] font-bold leading-none text-white shadow-sm transition hover:bg-ui-primary-hover active:scale-95"
              >
                +
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(wh)}
              className="block w-full rounded-lg text-left active:scale-[0.99]"
            >
              <div
                className={`flex min-w-0 items-center gap-1.5 ${
                  compact ? "pr-6" : "pr-7"
                }`}
              >
                <span
                  className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide ring-1 ring-inset ${chip.className}`}
                >
                  {chip.label}
                </span>
                <p
                  className={`min-w-0 truncate font-bold tracking-wide text-dashboard-ink ${
                    compact ? "text-[10px]" : "text-[11px]"
                  }`}
                >
                  {warehouseLabel[wh]}
                </p>
              </div>
              <div
                className={`grid grid-cols-3 ${compact ? "mt-1 gap-0.5" : "mt-1.5 gap-1"}`}
              >
                <Metric label="Lô" value={m.lots} large={isActive} compact={compact} />
                <Metric label="Kiện" value={m.pcs} large={isActive} compact={compact} />
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
              : "text-[15px] leading-tight"
            : compact
              ? "text-xs"
              : "text-sm leading-tight"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
