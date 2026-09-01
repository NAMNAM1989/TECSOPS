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

/** Accent 3px card mobile / desktop — TECS-TCS blue, SCSC purple. */
export const WAREHOUSE_CARD_ACCENT: Record<Warehouse, string> = {
  "TECS-TCS": "border-l-sky-500",
  "TECS-SCSC": "border-l-violet-500",
  TCS: "border-l-cyan-500",
  SCSC: "border-l-fuchsia-500",
};

const CARD_ACCENT = WAREHOUSE_CARD_ACCENT;

const CHIP_ACTIVE: Record<Warehouse, string> = {
  "TECS-TCS": "bg-sky-600 text-white ring-sky-700/40",
  "TECS-SCSC": "bg-violet-600 text-white ring-violet-700/40",
  TCS: "bg-cyan-600 text-white ring-cyan-700/40",
  SCSC: "bg-fuchsia-600 text-white ring-fuchsia-700/40",
};

const CHIP_IDLE: Record<Warehouse, string> = {
  "TECS-TCS": "bg-sky-50 text-sky-950 ring-sky-200/90",
  "TECS-SCSC": "bg-violet-50 text-violet-950 ring-violet-200/90",
  TCS: "bg-cyan-50 text-cyan-950 ring-cyan-200/90",
  SCSC: "bg-fuchsia-50 text-fuchsia-950 ring-fuchsia-200/90",
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
  /**
   * Round 3 mobile: 1 hàng chip cuộn ngang (tên + số lô) — không ăn nửa màn hình như lưới 2×2.
   */
  chips?: boolean;
  /** Chip thấp hơn — desktop overview. */
  denseChips?: boolean;
  /** Mobile — giữ vùng chạm ≥40px */
  touchTargets?: boolean;
  /** Tab kho: chỉ nhãn ngắn, không Lô/PCS/KG trong tab. */
  labelOnly?: boolean;
  hideAddButton?: boolean;
  className?: string;
}

/**
 * Chọn kho — desktop: 1 hàng metric ngang (thấp); mobile chips: hàng cuộn; compact: lưới 2×2.
 */
export function WarehouseGridPicker({
  rows,
  active,
  onSelect,
  onAddRow,
  highlightWarehouses = [],
  compact = false,
  chips = false,
  denseChips = false,
  touchTargets = false,
  labelOnly = false,
  hideAddButton = false,
  className = "",
}: Props) {
  const metrics = computeWarehouseMetrics(rows);

  if (chips) {
    return (
      <div
        className={`flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] ${
          labelOnly ? "h-11 items-center" : "pb-0.5"
        } ${className}`}
        role="tablist"
        aria-label="Chọn kho"
        data-testid="warehouse-chips"
        data-label-only={labelOnly ? "true" : undefined}
      >
        {WAREHOUSE_ORDER.map((wh) => {
          const m = metrics[wh];
          const isActive = active === wh;
          const hasSearchHit = highlightWarehouses.includes(wh);
          const kg = formatKgTotal(m.kg);
          if (labelOnly) {
            return (
              <button
                key={wh}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={`${warehouseLabel[wh]} · Lô ${m.lots} · PCS ${m.pcs} · KG ${kg}`}
                onClick={() => onSelect(wh)}
                className={`inline-flex h-11 min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-ui-md px-3 text-[13px] font-semibold leading-[18px] transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus ${
                  isActive
                    ? "bg-ui-primary text-white"
                    : "bg-ui-surface-muted text-ui-text-muted"
                } ${hasSearchHit && !isActive ? "ring-2 ring-ui-primary/50" : ""}`}
              >
                {warehouseLabel[wh]}
              </button>
            );
          }
          return (
            <button
              key={wh}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={`${warehouseLabel[wh]} · Lô ${m.lots} · Kiện ${m.pcs} · Kg ${kg}`}
              onClick={() => onSelect(wh)}
              className={`inline-flex shrink-0 touch-manipulation items-center text-left ring-1 transition active:scale-[0.98] ${
                denseChips
                  ? touchTargets
                    ? "min-h-10 flex-col justify-center gap-0 rounded-xl px-2.5 py-1"
                    : "h-8 gap-1.5 rounded-lg px-2"
                  : "min-h-11 flex-col justify-center rounded-xl px-2.5 py-1"
              } ${
                isActive ? CHIP_ACTIVE[wh] : CHIP_IDLE[wh]
              } ${hasSearchHit && !isActive ? "ring-2 ring-ui-primary/50" : ""}`}
            >
              <span
                className={`font-extrabold tracking-tight ${
                  denseChips && !touchTargets ? "text-[10px]" : "text-[11px]"
                }`}
              >
                {warehouseLabel[wh]}
              </span>
              {denseChips && !touchTargets ? (
                <span className="font-mono text-[9px] font-bold tabular-nums leading-none">
                  {m.lots}
                  <span className={isActive ? "mx-0.5 text-white/50" : "mx-0.5 text-ui-border"}>
                    ·
                  </span>
                  {m.pcs}
                  <span className={isActive ? "mx-0.5 text-white/50" : "mx-0.5 text-ui-border"}>
                    ·
                  </span>
                  {kg}
                </span>
              ) : (
                <span className="font-mono text-[10px] font-bold tabular-nums leading-tight">
                  Lô {m.lots}
                  <span className={isActive ? "mx-0.5 text-white/50" : "mx-0.5 text-ui-border"}>
                    ·
                  </span>
                  Kiện {m.pcs}
                  <span className={isActive ? "mx-0.5 text-white/50" : "mx-0.5 text-ui-border"}>
                    ·
                  </span>
                  Kg {kg}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? `grid grid-cols-2 gap-1 ${className}`
          : `grid grid-cols-2 gap-1 sm:grid-cols-4 ${className}`
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
              compact ? "px-1.5 py-1" : "px-2 py-1"
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
                className={`mt-px truncate font-mono tabular-nums text-ui-navy ${
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
