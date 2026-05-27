import { useCallback, useState, type MouseEvent } from "react";
import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { ShipmentInvoiceModal } from "./ShipmentInvoiceModal";
import { OPS } from "../styles/opsModalStyles";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  onUpdate: (id: string, patch: Partial<Shipment>) => void;
  variant?: "toolbar" | "standalone";
  className?: string;
  title?: string;
};

/** Icon hải quan — khiên + dấu kiểm (khai báo xuất khẩu). */
export function CustomsDeclarationIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 2.5L5 5.25v5.5c0 4.6 3.1 8.9 7 10.1 3.9-1.2 7-5.5 7-10.1v-5.5L12 2.5z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5l2 2 3.5-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v2" />
    </svg>
  );
}

export function ShipmentInvoiceExportButton({
  shipment,
  customerDirectory,
  onUpdate,
  variant = "toolbar",
  className,
  title = "Khai báo hải quan — map mặt hàng & xuất invoice",
}: Props) {
  const [open, setOpen] = useState(false);
  const itemCount = shipment.invoiceItems?.length ?? 0;

  const handleSaveItems = useCallback(
    (items: InvoiceLineItem[]) => {
      onUpdate(shipment.id, { invoiceItems: items });
    },
    [onUpdate, shipment.id]
  );

  const onOpen = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  }, []);

  const btnClass =
    className ??
    (variant === "toolbar"
      ? `${OPS.actionIcon} ${OPS.actionIconCustoms} ${itemCount > 0 ? "ring-1 ring-indigo-500/35" : ""}`
      : "inline-flex h-6 w-6 items-center justify-center rounded border border-indigo-500/30 bg-white text-indigo-800 hover:bg-indigo-500/10 dark:border-indigo-400/40 dark:bg-ops-elevated dark:text-indigo-200");

  return (
    <>
      <button
        type="button"
        title={itemCount > 0 ? `${title} (${itemCount} dòng)` : title}
        aria-label={title}
        onClick={onOpen}
        className={btnClass}
      >
        <CustomsDeclarationIcon />
      </button>
      <ShipmentInvoiceModal
        open={open}
        shipment={shipment}
        customerDirectory={customerDirectory}
        onClose={() => setOpen(false)}
        onSaveItems={handleSaveItems}
      />
    </>
  );
}
