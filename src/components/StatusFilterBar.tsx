import { useMemo } from "react";
import type { Shipment, ShipmentStatus } from "../types/shipment";
import { statusLabel } from "./statusStyles";

export type StatusFilterValue = ShipmentStatus | "ALL";

const ORDER: ShipmentStatus[] = [
  "PENDING",
  "RECEIVED",
  "AT_RISK",
  "CUTOFF_PASSED",
  "BUILT_UP",
  "DEPARTED",
  "DELIVERED",
];

const dotClass: Record<ShipmentStatus, string> = {
  PENDING: "bg-white ring-1 ring-slate-300",
  RECEIVED: "bg-yellow-400",
  AT_RISK: "bg-red-500",
  CUTOFF_PASSED: "bg-orange-500",
  BUILT_UP: "bg-emerald-500",
  DEPARTED: "bg-violet-500",
  DELIVERED: "bg-sky-500",
};

interface StatusFilterBarProps {
  /** Các lô trong ngày đang xem (chưa lọc) */
  dayRows: Shipment[];
  value: StatusFilterValue;
  onChange: (v: StatusFilterValue) => void;
}

export function StatusFilterBar({ dayRows, value, onChange }: StatusFilterBarProps) {
  const counts = useMemo(() => {
    const m = new Map<ShipmentStatus, number>();
    for (const st of ORDER) m.set(st, 0);
    for (const r of dayRows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [dayRows]);

  if (dayRows.length === 0) return null;

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
      {/* Mobile: xuống nhiều dòng để thấy hết chip; md+: một hàng + cuộn ngang nếu vẫn chật */}
      <div className="flex min-w-0 flex-wrap gap-2 md:flex-nowrap md:gap-2 md:overflow-x-auto md:overscroll-x-contain md:pb-1 md:[-webkit-overflow-scrolling:touch] md:pr-1 md:[scrollbar-width:thin]">
        <FilterChip
          active={value === "ALL"}
          onClick={() => onChange("ALL")}
          dotClass="bg-gradient-to-br from-slate-400 to-slate-600"
          label="Tất cả"
          count={dayRows.length}
        />
        {ORDER.map((st) => (
          <FilterChip
            key={st}
            active={value === st}
            onClick={() => onChange(st)}
            dotClass={dotClass[st]}
            label={statusLabel[st]}
            count={counts.get(st) ?? 0}
          />
        ))}
      </div>
      {value !== "ALL" && (
        <p className="mt-2 text-[11px] text-apple-tertiary">
          Đang hiện các lô: <span className="font-semibold text-apple-label">{statusLabel[value]}</span>
        </p>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dotClass,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  dotClass: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] max-w-full shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-[11px] font-semibold leading-tight transition-all active:scale-[0.98] sm:gap-2 sm:px-3 sm:text-xs md:rounded-full md:px-3.5 ${
        active
          ? "border-apple-blue/40 bg-apple-blue/10 text-apple-label shadow-[0_0_0_2px_rgba(0,122,255,0.2)]"
          : "border-black/[0.08] bg-white/80 text-apple-secondary hover:border-black/[0.12] hover:bg-black/[0.03]"
      }`}
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${
          active ? "bg-apple-blue text-white" : "bg-black/[0.06] text-apple-label"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
