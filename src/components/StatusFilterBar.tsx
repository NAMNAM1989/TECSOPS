import { useMemo } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import { SHIPMENT_STATUS_ORDER } from "../utils/shipmentWorkflowStatus";
import { statusLabel } from "./statusStyles";

export type StatusFilterValue = ShipmentStatus | "ALL";

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

  const segments = (
    <div
      className={`inline-flex min-w-0 items-center rounded-full border border-black/[0.05] bg-white/70 p-0.5 shadow-dashboard-card backdrop-blur-md dark:border-white/[0.08] dark:bg-dashboard-surface-dark/70 ${
        compact ? "gap-0.5" : "gap-1 p-1"
      }`}
      role="tablist"
      aria-label="Lọc trạng thái"
    >
      <FilterSegment
        compact={compact}
        active={value === "ALL"}
        onClick={() => onChange("ALL")}
        label="Tất cả"
        count={dayRows.length}
      />
      {SHIPMENT_STATUS_ORDER.map((st) => (
        <FilterSegment
          key={st}
          compact={compact}
          active={value === st}
          onClick={() => onChange(st)}
          label={statusLabel[st]}
          count={counts.get(st) ?? 0}
        />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {segments}
        </div>
        {value !== "ALL" ? (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-apple-secondary hover:bg-black/[0.04] hover:text-apple-label dark:hover:bg-white/[0.06] dark:hover:text-ops-label"
            title="Xóa lọc trạng thái"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-6 min-w-0 rounded-2xl border border-black/[0.06] bg-white/50 p-3 shadow-sm backdrop-blur-md dark:border-white/[0.08] dark:bg-ops-surface/40 sm:p-4">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-bold uppercase tracking-wide text-apple-secondary dark:text-ops-secondary">
          Lọc trạng thái
        </p>
        {value !== "ALL" && (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded-full border border-black/[0.08] bg-white/60 px-2.5 py-1 text-[10px] font-semibold text-apple-label backdrop-blur-sm hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.08] dark:text-ops-label"
          >
            Xóa lọc
          </button>
        )}
      </div>
      <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        {segments}
      </div>
    </div>
  );
}

function FilterSegment({
  active,
  onClick,
  label,
  count,
  compact,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  compact?: boolean;
}) {
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative shrink-0 whitespace-nowrap rounded-full font-semibold leading-tight transition-all duration-200 active:scale-[0.98] ${
        compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px] sm:text-xs"
      } ${
        isEmpty && !active ? "opacity-40" : "opacity-100"
      } ${
        active
          ? "bg-dashboard-primary text-white shadow-[0_2px_10px_rgba(15,23,42,0.18)] dark:bg-white/15 dark:text-dashboard-primary-dark dark:shadow-[0_2px_12px_rgba(96,165,250,0.22)]"
          : "text-dashboard-muted hover:bg-black/[0.04] hover:text-dashboard-primary dark:text-dashboard-muted-dark dark:hover:bg-white/[0.08] dark:hover:text-dashboard-primary-dark"
      }`}
    >
      <span>{label}</span>
      <span
        className={`ml-1 tabular-nums ${
          active ? "text-white/80 dark:text-dashboard-primary-dark/80" : "text-dashboard-muted/80 dark:text-dashboard-muted-dark/80"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
