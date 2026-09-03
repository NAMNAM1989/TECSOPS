export type Rng = () => number;

export function createSeededRng(seed?: number): Rng;

export function buildH21InvoiceNo(
  shipment: { customerCode?: string; flight?: string; flightDate?: string },
  customerEntry?: { code?: string } | null,
  seqOrOpts?: number | { seq?: number; total?: number }
): string;

export function allocateH21InvoiceLinesFromItems(opts: {
  items: unknown[];
  grossKg: number;
  rng?: Rng;
  coverage?: { minCoverage?: number; maxCoverage?: number };
}): import("./scscH21CatalogNormalize.mjs").ScscH21InvoiceLine[];

export function generateRandomH21InvoiceLines(opts: {
  catalog: unknown[];
  lineCount: number;
  grossKg: number;
  rng?: Rng;
  coverage?: { minCoverage?: number; maxCoverage?: number };
  /** Nhóm hàng — lọc + gom theo category tương tự */
  cargoFamily?: import("./scscH21InvoiceGroups.d.ts").H21CargoFamilyId;
}): import("./scscH21CatalogNormalize.mjs").ScscH21InvoiceLine[];

export function computeH21InvoiceFooter(
  shipment: { kg?: number | null; pcs?: number | null },
  lines: { weightKg?: number; amount?: number; quantity?: number }[],
  opts?: { declarationKg?: number | null }
): {
  grossKg: number;
  lotKg: number;
  lotPcs: number;
  declarationPcs: number;
  linesKg: number;
  residualKg: number;
  lineAmount: number;
  lineQty: number;
  totalCartonPkgs: number;
  pcs: number;
};

export type H21InvoiceDocument = {
  title: string;
  customsNote: string;
  invoiceNo: string;
  dateLabel: string;
  flightLabel: string;
  shipper: { name: string; address: string; phone: string; sealImageData?: string | null };
  cnee: { name: string; addressLines: string[]; phone: string };
  lines: {
    no: number;
    description: string;
    origin: string;
    quantity: number;
    uom: string;
    weightKg: number;
    unitPrice: number;
    amount: number;
  }[];
  footer: ReturnType<typeof computeH21InvoiceFooter>;
  paymentNote: string;
};

export function buildH21InvoiceDocument(opts: {
  shipment: {
    customerCode?: string;
    flight?: string;
    flightDate?: string;
    sessionDate?: string;
    kg?: number | null;
    pcs?: number | null;
  };
  customerEntry?: { code?: string } | null;
  shipper?: {
    shipperName?: string;
    shipperAddress?: string;
    shipperPhone?: string;
    sealImageData?: string | null;
  } | null;
  cnee?: { name?: string; addressLines?: string[]; phone?: string } | null;
  lines: unknown[];
  declarationKg?: number | null;
  invoiceSeq?: number;
  invoiceSeqTotal?: number;
}): H21InvoiceDocument;

export function validateH21InvoiceExport(opts: {
  shipment: { customerCode?: string; flight?: string; flightDate?: string; kg?: number | null };
  customerEntry?: { code?: string } | null;
  shipper?: { shipperName?: string } | null;
  cnee?: { name?: string } | null;
  lines?: unknown[];
}): string[];
