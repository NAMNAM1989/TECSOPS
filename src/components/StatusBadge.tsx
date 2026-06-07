import type { ShipmentStatus } from "../types/shipment";
import { SHIPMENT_STATUS_ORDER } from "../utils/shipmentWorkflowStatus";
import { statusLabel, statusSelectSurface } from "./statusStyles";

interface StatusSelectProps {
  value: ShipmentStatus;
  onChange: (s: ShipmentStatus) => void;
  compact?: boolean;
}

export function StatusSelect({ value, onChange, compact }: StatusSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ShipmentStatus)}
      onClick={(e) => e.stopPropagation()}
      className={`cursor-pointer rounded-md border font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-apple-blue/25 ${statusSelectSurface[value]} ${
        compact ? "max-w-[6.75rem] px-1.5 py-0.5 text-[8px] leading-tight" : "px-2.5 py-1 text-xs"
      }`}
    >
      {SHIPMENT_STATUS_ORDER.map((st) => (
        <option key={st} value={st}>
          {statusLabel[st]}
        </option>
      ))}
    </select>
  );
}

/** Chỉ hiển thị — dùng trên card mobile gọn (sửa status trong sheet). */
export function StatusReadonly({ value, compact }: { value: ShipmentStatus; compact?: boolean }) {
  const dotColor = {
    PENDING: "bg-blue-400 dark:bg-blue-300 shadow-[0_0_6px_rgba(96,165,250,0.5)]",
    RECEIVED: "bg-amber-400 dark:bg-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.5)]",
    VOLUME_DONE: "bg-cyan-400 dark:bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.5)]",
    CUSTOMS: "bg-sky-500 dark:bg-sky-400 shadow-[0_0_6px_rgba(14,165,233,0.5)]",
    SECURITY: "bg-orange-400 dark:bg-orange-300 shadow-[0_0_6px_rgba(251,146,60,0.5)]",
    OLA_PULL: "bg-fuchsia-500 dark:bg-fuchsia-400 shadow-[0_0_6px_rgba(217,70,239,0.5)]",
    WEIGH_SLIP: "bg-lime-500 dark:bg-lime-400 shadow-[0_0_6px_rgba(132,204,22,0.5)]",
    COMPLETED: "bg-emerald-400 dark:bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.5)]",
  }[value];

  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border font-bold ${statusSelectSurface[value]} ${
        compact ? "px-2 py-0.5 text-[9px] leading-tight" : "px-3 py-1 text-xs"
      }`}
      title={statusLabel[value]}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="truncate">{statusLabel[value]}</span>
    </span>
  );
}
