import { useMemo } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import { SHIPMENT_STATUS_ORDER } from "../utils/shipmentWorkflowStatus";
import { statusLabel } from "./statusStyles";

export type StatusFilterValue = ShipmentStatus | "ALL";

const dotClass: Record<ShipmentStatus, string> = {
  PENDING: "bg-slate-400 ring-2 ring-slate-600/30",
  RECEIVED: "bg-amber-500 ring-2 ring-amber-800/25",
  VOLUME_DONE: "bg-cyan-500 ring-2 ring-cyan-800/25",
  CUSTOMS: "bg-blue-600 ring-2 ring-blue-900/30",
  SECURITY: "bg-orange-500 ring-2 ring-orange-900/25",
  OLA_PULL: "bg-fuchsia-600 ring-2 ring-fuchsia-950/30",
  WEIGH_SLIP: "bg-lime-500 ring-2 ring-lime-800/30",
  COMPLETED: "bg-emerald-600 ring-2 ring-emerald-900/30",
};

interface StatusFilterBarProps {
  /** Các lô trong ngày đang xem (chưa lọc) */
  dayRows: Shipment[];
  value: StatusFilterValue;
  onChange: (v: StatusFilterValue) => void;
  /** Gọn — không khung lớn, không tiêu đề/ghi chú */
  compact?: boolean;
}

export function StatusFilterBar({ dayRows, value, onChange, compact }: StatusFilterBarProps) {
  const counts = useMemo(() => {
    const m = new Map<ShipmentStatus, number>();
    for (const st of SHIPMENT_STATUS_ORDER) m.set(st, 0);
    for (const r of dayRows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [dayRows]);

  if (dayRows.length === 0) return null;

  const chips = (
    <>
      <FilterChip
        compact={compact}
        active={value === "ALL"}
        onClick={() => onChange("ALL")}
        dotClass="bg-gradient-to-br from-slate-400 to-slate-600"
        label="Tất cả"
        count={dayRows.length}
      />
      {SHIPMENT_STATUS_ORDER.map((st) => (
        <FilterChip
          key={st}
          compact={compact}
          active={value === st}
          onClick={() => onChange(st)}
          dotClass={dotClass[st]}
          label={statusLabel[st]}
          count={counts.get(st) ?? 0}
        />
      ))}
    </>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {chips}
        </div>
        {value !== "ALL" ? (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-apple-blue hover:bg-apple-blue/10"
            title="Xóa lọc trạng thái"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-6 min-w-0 rounded-2xl border border-black/[0.08] bg-white/90 p-3 shadow-apple backdrop-blur-sm sm:p-4">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-bold uppercase tracking-wide text-apple-secondary">Lọc trạng thái</p>
        {value !== "ALL" && (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded-full border border-black/[0.1] bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold text-apple-label hover:bg-black/[0.07]"
          >
            Xóa lọc
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2 md:flex-nowrap md:gap-2 md:overflow-x-auto md:overscroll-x-contain md:pb-1 md:[-webkit-overflow-scrolling:touch] md:pr-1 md:[scrollbar-width:thin]">
        {chips}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dotClass,
  label,
  count,
  compact,
}: {
  active: boolean;
  onClick: () => void;
  dotClass: string;
  label: string;
  count: number;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-lg border font-semibold leading-tight transition-all active:scale-[0.98] ${
        compact
          ? "min-h-[28px] px-2 py-0.5 text-[10px] md:rounded-full"
          : "min-h-[40px] gap-1.5 rounded-xl px-2.5 py-2 text-[11px] text-left sm:gap-2 sm:px-3 sm:text-xs md:rounded-full md:px-3.5"
      } ${
        active
          ? "border-apple-blue/40 bg-apple-blue/10 text-apple-label shadow-[0_0_0_2px_rgba(0,122,255,0.2)] dark:border-apple-blue/50 dark:bg-apple-blue/15 dark:text-ops-label"
          : "border-black/[0.08] bg-white/80 text-apple-secondary hover:border-black/[0.12] hover:bg-black/[0.03] dark:border-white/10 dark:bg-ops-elevated/80 dark:text-ops-secondary dark:hover:bg-white/[0.06]"
      }`}
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${
          active ? "bg-apple-blue text-white" : "bg-black/[0.06] text-apple-label dark:bg-white/10 dark:text-ops-label"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
