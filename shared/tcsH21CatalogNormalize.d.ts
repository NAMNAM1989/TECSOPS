import type {
  TcsH21CatalogItem,
  TcsH21InvoiceLine,
  TcsH21StampId,
} from "../src/types/tcsH21Catalog";

export const TCS_H21_WAREHOUSE_SCOPE: "TCS";

export function normalizeTcsH21CatalogItem(
  raw: unknown,
  opts?: { keepId?: boolean; sortOrder?: number }
): TcsH21CatalogItem | null;

export function clampTcsH21Catalog(list: unknown): TcsH21CatalogItem[];

export function tcsH21DescriptionKey(description: unknown): string;

export function findDuplicateTcsH21Descriptions(
  list: unknown,
  opts?: { exceptId?: string }
): { key: string; description: string; ids: string[] }[];

export function findTcsH21DescriptionConflict(
  list: unknown,
  description: string,
  opts?: { exceptId?: string }
): { description: string; id: string } | null;

export function catalogItemFromExcelRow(row: Record<string, unknown>): TcsH21CatalogItem | null;

export function invoiceLineFromCatalogItem(catalogItem: unknown): TcsH21InvoiceLine | null;

export function normalizeTcsH21InvoiceLine(raw: unknown): TcsH21InvoiceLine | null;

export function clampTcsH21InvoiceLines(list: unknown): TcsH21InvoiceLine[];

export function normalizeTcsH21InvoiceDeclaration(
  raw: unknown,
  seqFallback?: number
): import("../src/types/tcsH21Catalog").TcsH21InvoiceDeclaration | null;

export function clampTcsH21InvoiceDeclarations(
  list: unknown
): import("../src/types/tcsH21Catalog").TcsH21InvoiceDeclaration[];

export type { TcsH21CatalogItem, TcsH21InvoiceLine, TcsH21StampId };
