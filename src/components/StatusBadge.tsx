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
  return (
    <span
      className={`inline-block shrink-0 rounded-md border font-semibold ${statusSelectSurface[value]} ${
        compact ? "max-w-[5.5rem] truncate px-1.5 py-0.5 text-[8px] leading-tight" : "px-2.5 py-1 text-xs"
      }`}
      title={statusLabel[value]}
    >
      {statusLabel[value]}
    </span>
  );
}
