import type { ShipmentStatus } from "../types/shipment";
import { SHIPMENT_STATUS_ORDER } from "../utils/shipmentWorkflowStatus";
import { statusBadge, statusLabel } from "./statusStyles";

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
      className={`cursor-pointer rounded-full border-0 shadow-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/30 ${statusBadge[value]} ${
        compact ? "max-w-[10.5rem] px-1 py-0.5 text-[9px] leading-tight" : "px-2.5 py-1 text-xs"
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
