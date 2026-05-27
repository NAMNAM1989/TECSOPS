import type { Shipment } from "../../types/shipment";
import type { CustomerDirectoryEntry } from "../../types/customerDirectory";
import type { InvoiceLineItem } from "../../types/invoiceItem";
import {
  invoiceLineAmountUsd,
  invoiceLineGrossWeightKg,
  roundDeclarationKg,
  totalsForInvoice,
} from "../../types/invoiceItem";
import { buildShipmentCneeBodyLines } from "../../utils/shipmentCneeCopyBlock";
import {
  buildInvoiceNumber,
  formatInvoiceFlightLine,
  formatInvoiceSheetDate,
} from "../../utils/shipmentInvoiceCore";
import {
  INVOICE_EXPORT_PAYLOAD_VERSION,
  type InvoiceExportLine,
  type InvoiceExportPayload,
} from "../contracts/invoiceExportPayload";

const SHIPPER_LINES = [
  "THE SHIPPER:",
  "CÔNG TY TNHH NAM NAM LOGISTICS",
  "11 NGUYỄN TRỌNG LỘI, PHƯỜNG TÂN SƠN NHẤT",
  "THÀNH PHỐ HỒ CHÍ MINH",
] as const;

export type BuildInvoiceExportOptions = {
  items?: InvoiceLineItem[];
  at?: Date;
  declarationSeq?: number;
  totalDeclarations?: number;
  footerPcs?: number | null;
  footerKg?: number | null;
};

function mapLines(items: InvoiceLineItem[]): InvoiceExportLine[] {
  return items.map((item, idx) => ({
    no: idx + 1,
    description: item.description ?? "",
    hsCode: item.hsCode ?? "",
    origin: item.origin || "VN",
    quantity: Number(item.quantity) || 0,
    unit: item.unit || "PCE",
    unitPriceUsd: Number(item.unitPriceUsd) || 0,
    kgPerUnit: Number(item.kgPerUnit) || 0,
    amountUsd: invoiceLineAmountUsd(item),
    grossKg: roundDeclarationKg(invoiceLineGrossWeightKg(item)),
  }));
}

export function buildInvoiceExportPayload(
  shipment: Shipment,
  directory: readonly CustomerDirectoryEntry[] = [],
  options: BuildInvoiceExportOptions
): InvoiceExportPayload {
  const at = options.at ?? new Date();
  const items = options.items ?? [];
  const declarationSeq = options.declarationSeq ?? 1;
  const totalDeclarations = options.totalDeclarations ?? 1;
  const totals = totalsForInvoice(items);
  const footerPcsRaw = options.footerPcs ?? shipment.pcs ?? null;
  const footerPcs =
    footerPcsRaw != null && footerPcsRaw > 0 ? Math.round(footerPcsRaw) : null;
  const footerKg = roundDeclarationKg(
    options.footerKg ?? totals.totalGrossKg ?? shipment.kg ?? 0
  );

  const invoiceNo = buildInvoiceNumber(
    shipment,
    directory,
    at,
    declarationSeq,
    totalDeclarations
  );

  return {
    version: INVOICE_EXPORT_PAYLOAD_VERSION,
    meta: {
      invoiceNo,
      dateStr: formatInvoiceSheetDate(at),
      flightLine: formatInvoiceFlightLine(shipment),
      awb: shipment.awb ?? "",
      declarationSeq,
      totalDeclarations,
    },
    shipper: { lines: SHIPPER_LINES },
    cnee: {
      lines: buildShipmentCneeBodyLines(shipment, directory, { omitEmail: true }),
    },
    lines: mapLines(items),
    totals: {
      totalAmountUsd: Number(totals.totalAmountUsd.toFixed(2)),
      totalGrossKg: totals.totalGrossKg,
    },
    footer: {
      cartons: footerPcs,
      grossKg: footerKg,
    },
    page: { size: "A4", orientation: "portrait" },
  };
}
