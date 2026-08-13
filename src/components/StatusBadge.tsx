import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { selectableStatusesForShipment } from "../utils/shipmentWorkflowStatus";
import {
  statusIcon,
  statusLabelCompact,
  statusLabelShort,
  statusSelectSurface,
} from "./statusStyles";

interface StatusSelectProps {
  value: ShipmentStatus;
  onChange: (s: ShipmentStatus) => void;
  /** Kho của lô — quyết định option hợp lệ. */
  warehouse: Warehouse;
  compact?: boolean;
}

export function StatusSelect({ value, onChange, warehouse, compact }: StatusSelectProps) {
  const options = selectableStatusesForShipment(warehouse, value);
  const labels = compact ? statusLabelCompact : statusLabelShort;

  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ShipmentStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Trạng thái · ${statusLabelShort[value]}`}
      title={`${statusIcon[value]} ${statusLabelShort[value]}`}
      className={`cursor-pointer rounded-md border font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ui-focus ${statusSelectSurface[value]} ${
        compact
          ? "h-9 w-full min-w-0 touch-manipulation truncate px-1 text-[10px] leading-none"
          : "px-2.5 py-1 text-xs"
      }`}
    >
      {options.map((st) => (
        <option key={st} value={st}>
          {statusIcon[st]} {labels[st]}
        </option>
      ))}
    </select>
  );

  if (!compact) return select;
  return (
    <div className="w-[4.75rem] max-w-[4.75rem] shrink-0 overflow-hidden">
      {select}
    </div>
  );
}
