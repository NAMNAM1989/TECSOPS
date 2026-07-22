/** Gioi han luu tren lo (ten hang / yeu cau khac). */
export const SCSC_GOODS_DESCRIPTION_PRINT_MAX = 150;
export const SCSC_OTHER_REQUIREMENTS_PRINT_MAX = 200;

function compact(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

export function clipScscGoodsDescriptionPrint(raw: string): string {
  return compact(raw, SCSC_GOODS_DESCRIPTION_PRINT_MAX);
}

export function clipScscOtherRequirementsPrint(raw: string): string {
  return compact(raw, SCSC_OTHER_REQUIREMENTS_PRINT_MAX);
}
