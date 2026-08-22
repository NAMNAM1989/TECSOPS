import type { ShipmentStatus, Warehouse } from "../types/shipment";
import { selectableStatusesForShipment } from "../utils/shipmentWorkflowStatus";
import {
  statusIcon,
  statusLabel,
  statusLabelCompact,
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
  const labels = compact ? statusLabelCompact : statusLabel;

  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ShipmentStatus)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Trạng thái · ${statusLabel[value]}`}
      title={`${statusIcon[value]} ${statusLabel[value]}`}
      className={`cursor-pointer rounded-lg border font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ui-focus ${statusSelectSurface[value]} ${
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

/** Pill trạng thái chỉ đọc — cùng từ vựng với filter/select. */
export function StatusPill({
  status,
  compact = false,
  className = "",
}: {
  status: ShipmentStatus;
  compact?: boolean;
  className?: string;
}) {
  const label = compact ? statusLabelCompact[status] : statusLabel[status];
  return (
    <span
      title={statusLabel[status]}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusSelectSurface[status]} ${className}`}
    >
      <span aria-hidden>{statusIcon[status]}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
