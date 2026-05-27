import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { HqInvoiceSavePayload } from "../types/invoiceDeclaration";
import type { InvoiceCatalog } from "../utils/invoiceCatalogCore";
import { ShipmentInvoiceWorkspace } from "./ShipmentInvoiceWorkspace";

type Props = {
  shipment: Shipment;
  customerDirectory: readonly CustomerDirectoryEntry[];
  invoiceCatalog?: InvoiceCatalog;
  onSave: (payload: HqInvoiceSavePayload) => void | Promise<void>;
  onSaveCatalog: (catalog: InvoiceCatalog) => void | Promise<void>;
  onClose: () => void;
};

/** Trang khai báo HQ toàn màn — mở qua `#/hq/:shipmentId`. */
export function ShipmentInvoicePage({
  shipment,
  customerDirectory,
  invoiceCatalog,
  onSave,
  onSaveCatalog,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[700] flex flex-col overflow-hidden bg-white dark:bg-dashboard-surface-dark">
      <ShipmentInvoiceWorkspace
        shipment={shipment}
        customerDirectory={customerDirectory}
        invoiceCatalog={invoiceCatalog}
        onSave={onSave}
        onSaveCatalog={onSaveCatalog}
        onClose={onClose}
      />
    </div>
  );
}
