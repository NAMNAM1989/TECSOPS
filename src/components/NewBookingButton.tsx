import type { Warehouse } from "../types/shipment";
import { warehouseLabel } from "../constants/warehouses";

interface Props {
  activeWarehouse: Warehouse;
  onAdd: (warehouse: Warehouse) => void;
  /** Chỉ icon + — mobile header */
  iconOnly?: boolean;
}

/** CTA chính Ops — luôn ngoài menu Công cụ. */
export function NewBookingButton({ activeWarehouse, onAdd, iconOnly = false }: Props) {
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => onAdd(activeWarehouse)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ui-primary text-white shadow-ui-sm transition hover:bg-ui-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]"
        title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
        aria-label={`Thêm booking ${warehouseLabel[activeWarehouse]}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onAdd(activeWarehouse)}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-ui-primary px-3.5 py-1.5 text-[12px] font-bold text-white shadow-ui-sm transition hover:bg-ui-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus active:scale-[0.98]"
      title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      + Booking
      <span className="hidden max-w-[5.5rem] truncate font-semibold opacity-90 sm:inline">
        · {warehouseLabel[activeWarehouse]}
      </span>
    </button>
  );
}
