import type { CustomerDirectoryEntry, CustomerSavedGoods } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";

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

export function resolveScscGoodsDescriptionPrint(
  booking: Pick<Shipment, "goodsDescriptionPrint" | "note">,
  savedGoods?: CustomerSavedGoods
): string {
  const onBooking = booking.goodsDescriptionPrint?.trim();
  if (onBooking) return clipScscGoodsDescriptionPrint(onBooking);
  const fromTemplate = savedGoods?.goodsDescription?.trim();
  if (fromTemplate) return clipScscGoodsDescriptionPrint(fromTemplate);
  const note = booking.note?.trim();
  if (note) return clipScscGoodsDescriptionPrint(note);
  return "";
}

export function resolveScscOtherRequirementsPrint(
  booking: Pick<Shipment, "otherRequirementsPrint">,
  customer?: CustomerDirectoryEntry
): string {
  const onBooking = booking.otherRequirementsPrint?.trim();
  if (onBooking) return clipScscOtherRequirementsPrint(onBooking);
  const fromCustomer = customer?.otherRequirementsPrint?.trim();
  if (fromCustomer) return clipScscOtherRequirementsPrint(fromCustomer);
  return "";
}