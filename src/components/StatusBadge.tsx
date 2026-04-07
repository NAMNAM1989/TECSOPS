import type { ShipmentStatus } from "../types/shipment";
import { statusBadge, statusLabel } from "./statusStyles";

const allStatuses: ShipmentStatus[] = [
  "PENDING",
  "RECEIVED",
  "AT_RISK",
  "CUTOFF_PASSED",
  "BUILT_UP",
  "DEPARTED",
  "DELIVERED",
];

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
      className={`cursor-pointer rounded-md border-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 ${statusBadge[value]} ${
        compact ? "max-w-[9.5rem] px-1 py-0.5 text-[10px] leading-tight" : "px-2.5 py-1 text-xs"
      }`}
    >
      {allStatuses.map((st) => (
        <option key={st} value={st}>
          {statusLabel[st]}
        </option>
      ))}
    </select>
  );
}
