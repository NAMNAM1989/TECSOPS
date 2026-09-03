import type {
  ScscH21CatalogItem,
  ScscH21InvoiceLine,
  ScscH21StampId,
} from "../src/types/scscH21Catalog";

export const SCSC_H21_WAREHOUSE_SCOPE: "SCSC";

export function normalizeScscH21CatalogItem(
  raw: unknown,
  opts?: { keepId?: boolean; sortOrder?: number }
): ScscH21CatalogItem | null;

export function clampScscH21Catalog(list: unknown): ScscH21CatalogItem[];

export function scscH21DescriptionKey(description: unknown): string;

export function findDuplicateScscH21Descriptions(
  list: unknown,
  opts?: { exceptId?: string }
): { key: string; description: string; ids: string[] }[];

export function findScscH21DescriptionConflict(
  list: unknown,
  description: string,
  opts?: { exceptId?: string }
): { description: string; id: string } | null;

export function catalogItemFromExcelRow(row: Record<string, unknown>): ScscH21CatalogItem | null;

export function invoiceLineFromCatalogItem(catalogItem: unknown): ScscH21InvoiceLine | null;

export function normalizeScscH21InvoiceLine(raw: unknown): ScscH21InvoiceLine | null;

export function clampScscH21InvoiceLines(list: unknown): ScscH21InvoiceLine[];

export type { ScscH21CatalogItem, ScscH21InvoiceLine, ScscH21StampId };
