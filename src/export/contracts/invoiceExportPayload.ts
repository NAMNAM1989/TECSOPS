/** Contract JSON cho export invoice — single source of truth (UI preview + Excel + PDF). */
export const INVOICE_EXPORT_PAYLOAD_VERSION = 1 as const;

export type InvoiceExportLine = {
  no: number;
  description: string;
  hsCode: string;
  origin: string;
  quantity: number;
  unit: string;
  unitPriceUsd: number;
  kgPerUnit: number;
  amountUsd: number;
  grossKg: number;
};

export type InvoiceExportPayload = {
  version: typeof INVOICE_EXPORT_PAYLOAD_VERSION;
  meta: {
    invoiceNo: string;
    dateStr: string;
    flightLine: string;
    awb: string;
    declarationSeq: number;
    totalDeclarations: number;
  };
  shipper: {
    lines: readonly string[];
  };
  cnee: {
    lines: readonly string[];
  };
  lines: InvoiceExportLine[];
  totals: {
    totalAmountUsd: number;
    totalGrossKg: number;
  };
  footer: {
    cartons: number | null;
    grossKg: number;
  };
  page: {
    size: "A4";
    orientation: "portrait";
  };
};

export type InvoiceExportFormat = "xlsx" | "pdf";
