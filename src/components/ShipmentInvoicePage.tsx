import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import { ShipmentInvoiceWorkspace } from "./ShipmentInvoiceWorkspace";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  invoiceCatalog?: InvoiceCatalog;
  onSaveItems: (items: InvoiceLineItem[]) => void | Promise<void>;
  onSaveCatalog: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

/** Trang khai báo HQ toàn màn — mở qua `#/hq/:shipmentId`. */
export function ShipmentInvoicePage({
  shipment,
  customerDirectory,
  invoiceCatalog,
  onSaveItems,
  onSaveCatalog,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[700] flex flex-col overflow-hidden bg-white dark:bg-dashboard-surface-dark">
      <ShipmentInvoiceWorkspace
        shipment={shipment}
        customerDirectory={customerDirectory}
        invoiceCatalog={invoiceCatalog}
        onSaveItems={onSaveItems}
        onSaveCatalog={onSaveCatalog}
        onClose={onClose}
      />
    </div>
  );
}
