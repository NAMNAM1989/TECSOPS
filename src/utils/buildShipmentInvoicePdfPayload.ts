import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  buildInvoiceExportPayload,
  type BuildInvoiceExportOptions,
} from "../export/builders/buildInvoiceExportPayload";

export type ShipmentInvoicePdfPayload = ReturnType<typeof buildInvoiceExportPayload>;

/** @deprecated Dùng buildInvoiceExportPayload — giữ tương thích. */
export function buildShipmentInvoicePdfPayload(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceExportOptions = {}
): ShipmentInvoicePdfPayload {
  return buildInvoiceExportPayload(shipment, directory, options);
}

export type { BuildInvoiceExportOptions };
