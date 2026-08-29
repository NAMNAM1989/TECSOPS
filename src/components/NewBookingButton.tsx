import type { Warehouse } from "../types/shipment";
import { warehouseLabel } from "../constants/warehouses";
import { Button, IconButton } from "../ui";

interface Props {
  activeWarehouse: Warehouse;
  onAdd: (warehouse: Warehouse) => void;
  /** Chỉ icon + — mobile header */
  iconOnly?: boolean;
}

/** CTA chính Ops — luôn ngoài menu Công cụ. */
export function NewBookingButton({ activeWarehouse, onAdd, iconOnly = false }: Props) {
  const plusIcon = (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );

  if (iconOnly) {
    return (
      <IconButton
        label={`Thêm booking ${warehouseLabel[activeWarehouse]}`}
        variant="primary"
        size="md"
        onClick={() => onAdd(activeWarehouse)}
        title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
        className="shrink-0"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </IconButton>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() => onAdd(activeWarehouse)}
      title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
      aria-label={`+ Booking ${warehouseLabel[activeWarehouse]}`}
      className="px-3 font-bold"
    >
      {plusIcon}
      Booking
      <span className="hidden max-w-[5.5rem] truncate font-semibold opacity-90 sm:inline">
        · {warehouseLabel[activeWarehouse]}
      </span>
    </Button>
  );
}
