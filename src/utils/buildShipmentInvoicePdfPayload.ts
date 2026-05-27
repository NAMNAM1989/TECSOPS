import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { InvoiceLineItem } from "../types/invoiceItem";
import { buildShipmentCneeBodyLines } from "./shipmentCneeCopyBlock";
import {
  buildInvoiceNumber,
  formatInvoiceSheetDate,
} from "./shipmentInvoiceCore";
import type { BuildInvoiceOptions } from "./exportShipmentInvoiceExcel";

export type ShipmentInvoicePdfPayload = {
  invoiceNo: string;
  dateStr: string;
  flight: string;
  cneeLines: string[];
  items: InvoiceLineItem[];
  pcs: number | null;
  kg: number | null;
  awb: string;
};

export function buildShipmentInvoicePdfPayload(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceOptions = {}
): ShipmentInvoicePdfPayload {
  const at = options.at ?? new Date();
  const items = options.items ?? shipment.invoiceItems ?? [];
  return {
    invoiceNo: buildInvoiceNumber(shipment, directory, at),
    dateStr: formatInvoiceSheetDate(at),
    flight: (shipment.flight ?? "").trim().toUpperCase(),
    cneeLines: buildShipmentCneeBodyLines(shipment, directory),
    items,
    pcs: shipment.pcs ?? null,
    kg: shipment.kg ?? null,
    awb: shipment.awb ?? "",
  };
}
