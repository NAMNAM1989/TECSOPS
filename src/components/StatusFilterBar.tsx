import { useMemo } from "react";
import type { Shipment, ShipmentStatus, Warehouse } from "../types/shipment";
import { statusOrderForFilter } from "../utils/shipmentWorkflowStatus";
import { statusIcon, statusLabel, statusLabelCompact } from "./statusStyles";

export type StatusFilterValue = ShipmentStatus | "ALL";

interface StatusFilterBarProps {
  /** Các lô trong ngày đang xem (chưa lọc) */
  dayRows: readonly Shipment[];
  value: StatusFilterValue;
  onChange: (v: StatusFilterValue) => void;
  /** Kho đang xem — chip theo workflow kho; ALL = union TCS. */
  warehouse?: Warehouse | "ALL";
  /** Gọn — không khung lớn, không tiêu đề/ghi chú */
  compact?: boolean;
  /** Ẩn tab trạng thái count=0 — mobile */
  hideEmpty?: boolean;
  /** Siêu gọn — mobile header */
  dense?: boolean;
  /** Hàng lọc desktop — segment h-8, không khung dày */
  tight?: boolean;
}

export function StatusFilterBar({
  dayRows,
  value,
  onChange,
  warehouse = "ALL",
  compact,
  hideEmpty,
  dense,
  tight,
}: StatusFilterBarProps) {
  const statusOrder = useMemo(() => statusOrderForFilter(warehouse), [warehouse]);

  const counts = useMemo(() => {
    const m = new Map<ShipmentStatus, number>();
    for (const st of statusOrder) m.set(st, 0);
    for (const r of dayRows) {
      if (!m.has(r.status)) continue;
      m.set(r.status, (m.get(r.status) ?? 0) + 1);
    }
    return m;
  }, [dayRows, statusOrder]);

  if (dayRows.length === 0) return null;

  const segments = (
    <div
      className={`inline-flex min-w-0 items-center rounded-full border border-ui-border/90 bg-ui-surface shadow-ui-sm ${
        tight ? "gap-0 p-0.5" : compact ? "gap-0.5 p-0.5" : "gap-1 p-1"
      }`}
      role="tablist"
      aria-label="Lọc trạng thái"
    >
      <FilterSegment
        compact={compact}
        dense={dense}
        tight={tight}
        active={value === "ALL"}
        onClick={() => {
          onChange("ALL");
        }}
        label="Tất cả"
        icon="☰"
        count={dayRows.length}
      />
      {statusOrder.map((st) => {
        const count = counts.get(st) ?? 0;
        if (hideEmpty && count === 0 && value !== st) return null;
        return (
          <FilterSegment
            key={st}
            compact={compact}
            dense={dense}
            tight={tight}
            active={value === st}
            onClick={() => {
              onChange(st);
            }}
            label={dense ? statusLabelCompact[st] : statusLabel[st]}
            icon={statusIcon[st]}
            count={count}
          />
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div
        className={`flex min-w-0 items-center gap-1 ${dense ? "shrink-0" : "flex-1"}`}
      >
        <div
          className={`min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch] ${
            dense ? "" : "flex-1 pb-0.5 [scrollbar-width:thin]"
          }`}
        >
          {segments}
        </div>
        {value !== "ALL" ? (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-semibold text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
            title="Xóa lọc trạng thái"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-6 min-w-0 rounded-xl border border-ui-border bg-ui-surface p-3 shadow-sm sm:p-4">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-bold uppercase tracking-wide text-ui-text-muted">
          Lọc trạng thái
        </p>
        {value !== "ALL" && (
          <button
            type="button"
            onClick={() => onChange("ALL")}
            className="shrink-0 rounded-full border border-ui-border bg-ui-surface px-2.5 py-1 text-[10px] font-semibold text-ui-text hover:bg-ui-surface-muted"
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
  icon,
  count,
  compact,
  dense,
  tight,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  count: number;
  compact?: boolean;
  dense?: boolean;
  tight?: boolean;
}) {
  const isEmpty = count === 0;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`btn-kinetic glide-pill relative shrink-0 select-none whitespace-nowrap rounded-full font-semibold leading-tight touch-manipulation ${
        tight
          ? "inline-flex h-8 items-center px-2 text-[10px]"
          : dense
            ? "inline-flex min-h-11 items-center px-2.5 py-1 text-[11px]"
            : compact
              ? "px-2.5 py-1 text-[10px]"
              : "px-3 py-1.5 text-[11px] sm:text-xs"
      } ${isEmpty && !active ? "opacity-40" : "opacity-100"} ${
        active
          ? "bg-ui-primary text-white shadow-[0_2px_8px_rgba(13,148,136,0.35)] scale-[1.02]"
          : "text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text hover:-translate-y-0.5"
      }`}
    >
      <span className="mr-0.5 opacity-80" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
      <span
        className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums transition-colors duration-200 ${
          active ? "bg-white/25 text-white" : "bg-black/5 text-ui-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
