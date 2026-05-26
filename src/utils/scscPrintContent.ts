import type { CustomerDirectoryEntry, CustomerSavedGoods } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { layoutScscGoods, SCSC_GOODS_MAX_LINES } from "../printing/scscWeigh/scscGoodsFontFit";
import { scscGoodsBoxWidthMm } from "../printing/scscWeigh/scscGoodsFontFit";

/** Giới hạn lưu trên lô — hiển thị in do `layoutScscGoods` xử lý. */
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

/** Cảnh báo khi tên hàng có thể bị cắt sau auto-fit (3 dòng). */
export function scscGoodsPrintOverflowWarning(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const layout = layoutScscGoods(raw, scscGoodsBoxWidthMm());
  const lineCount = layout.displayText.split("\n").filter((l) => l.trim()).length;
  if (lineCount >= SCSC_GOODS_MAX_LINES && layout.displayText.includes("…")) {
    return "Tên hàng dài — có thể bị cắt trên phiếu. Rút gọn hoặc chỉnh cỡ ô trong căn chỉnh.";
  }
  if (raw.length > 90 && lineCount >= SCSC_GOODS_MAX_LINES) {
    return "Tên hàng dài — kiểm tra preview trước khi in.";
  }
  return null;
}
