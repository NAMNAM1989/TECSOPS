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

export function parsePackWeightKgFromDescription(description: unknown): number | null;

export function resolveH21UnitFactorKg(item: {
  description?: unknown;
  unitFactor?: unknown;
  qty1?: unknown;
  qty2?: unknown;
} | null | undefined): number;

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

export function normalizeScscH21InvoiceDeclaration(
  raw: unknown,
  seqFallback?: number
): import("../src/types/scscH21Catalog").ScscH21InvoiceDeclaration | null;

export function clampScscH21InvoiceDeclarations(
  list: unknown
): import("../src/types/scscH21Catalog").ScscH21InvoiceDeclaration[];

export type { ScscH21CatalogItem, ScscH21InvoiceLine, ScscH21StampId };
