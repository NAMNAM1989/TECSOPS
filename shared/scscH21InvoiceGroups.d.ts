export type H21CargoFamilyId = "frozen" | "fruit" | "food" | "garment" | "general";

export type H21CargoFamilyOption = { id: H21CargoFamilyId; label: string };

export declare const H21_CARGO_FAMILIES: Record<
  H21CargoFamilyId,
  { id: H21CargoFamilyId; label: string; categories: string[]; keywords: RegExp[] }
>;

export function listH21CargoFamilyOptions(): H21CargoFamilyOption[];

export function detectH21CargoFamily(goodsText?: string): H21CargoFamilyId;

export function categorySetForH21Family(
  familyId: H21CargoFamilyId
): Set<string> | null;

export function filterCatalogByH21Family(
  catalog: unknown[],
  familyId: H21CargoFamilyId,
  minItems?: number
): unknown[];

export function countCatalogInH21Family(
  catalog: unknown[],
  familyId: H21CargoFamilyId
): number;

export function pickCatalogItemsGrouped(
  catalog: unknown[],
  count: number,
  rng: () => number
): unknown[];
