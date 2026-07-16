import type { Warehouse } from "../types/shipment";
import { warehouseLabel } from "../constants/warehouses";

interface Props {
  activeWarehouse: Warehouse;
  onAdd: (warehouse: Warehouse) => void;
  /** Chỉ icon + — mobile header */
  iconOnly?: boolean;
}

/** Một nút — 1 click thêm lô vào kho đang chọn. */
export function NewBookingButton({ activeWarehouse, onAdd, iconOnly = false }: Props) {
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => onAdd(activeWarehouse)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-apple-blue text-white shadow-[0_4px_14px_rgba(0,113,227,0.28)] transition hover:bg-apple-blue-hover active:scale-[0.98]"
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
      className="inline-flex items-center gap-1.5 rounded-full bg-apple-blue px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-[0_4px_14px_rgba(0,113,227,0.28)] transition hover:bg-apple-blue-hover active:scale-[0.98]"
      title={`Thêm lô vào ${warehouseLabel[activeWarehouse]} (phím N)`}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      + Booking
      <span className="hidden max-w-[5.5rem] truncate opacity-90 sm:inline">
        · {warehouseLabel[activeWarehouse]}
      </span>
    </button>
  );
}
