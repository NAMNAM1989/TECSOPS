import type { Shipment } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import { findCustomerEntry } from "./mapBookingToScaleTicketFormData";
import { openScscConsigneePrintModal } from "./openConsigneePickerModal";

export type ScscPrintConsigneeContext = {
  /** Bản dùng cho map in (có thể xóa tạm `customerConsigneeId`). */
  shipment: Shipment;
  /** Khi true: không tự lấy CNEE lưu sẵn duy nhất nếu booking không gắn id. */
  skipAutoSingleConsignee: boolean;
};

/**
 * Trước khi in phiếu cân: nếu khách có CNEE lưu sẵn — luôn mở hộp chọn (theo booking hoặc một CNEE đã lưu).
 * @returns `null` nếu hủy.
 */
export async function ensureScscConsigneeForPrint(
  s: Shipment,
  directory: readonly CustomerDirectoryEntry[]
): Promise<ScscPrintConsigneeContext | null> {
  const customer = findCustomerEntry(s, directory);
  const list = (customer?.savedConsignees ?? []).filter((x) => x.id.trim());
  if (list.length === 0) {
    return { shipment: s, skipAutoSingleConsignee: false };
  }
  const choice = await openScscConsigneePrintModal({ consignees: list });
  if (!choice) return null;
  if (choice.type === "booking") {
    return {
      shipment: { ...s, customerConsigneeId: "" },
      skipAutoSingleConsignee: true,
    };
  }
  return {
    shipment: { ...s, customerConsigneeId: choice.id },
    skipAutoSingleConsignee: false,
  };
}
