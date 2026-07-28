import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { selectableStatusesForShipment } from "../utils/shipmentWorkflowStatus";
import { statusIcon, statusLabel, statusSelectSurface } from "./statusStyles";

interface StatusSelectProps {
  value: ShipmentStatus;
  onChange: (s: ShipmentStatus) => void;
  /** Kho của lô — quyết định option hợp lệ. */
  warehouse: Warehouse;
  compact?: boolean;
}

export function StatusSelect({ value, onChange, warehouse, compact }: StatusSelectProps) {
  const options = selectableStatusesForShipment(warehouse, value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ShipmentStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Trạng thái · ${statusLabel[value]}`}
      title={`${statusIcon[value]} ${statusLabel[value]}`}
      className={`cursor-pointer rounded-md border font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ui-focus ${statusSelectSurface[value]} ${
        compact
          ? "max-w-[5.25rem] truncate px-1 py-0.5 text-[8px] leading-tight"
          : "px-2.5 py-1 text-xs"
      }`}
    >
      {options.map((st) => (
        <option key={st} value={st}>
          {statusIcon[st]} {statusLabel[st]}
        </option>
      ))}
    </select>
  );
}
