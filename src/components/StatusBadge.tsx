import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { selectableStatusesForShipment } from "../utils/shipmentWorkflowStatus";
import { statusIcon, statusLabelShort, statusSelectSurface } from "./statusStyles";

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
      aria-label={`Trạng thái · ${statusLabelShort[value]}`}
      title={`${statusIcon[value]} ${statusLabelShort[value]}`}
      className={`cursor-pointer rounded-md border font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ui-focus ${statusSelectSurface[value]} ${
        compact
          ? "h-9 max-w-[6.5rem] touch-manipulation truncate px-1.5 text-[10px] leading-none"
          : "px-2.5 py-1 text-xs"
      }`}
    >
      {options.map((st) => (
        <option key={st} value={st}>
          {statusIcon[st]} {statusLabelShort[st]}
        </option>
      ))}
    </select>
  );
}
