import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import {
  emptyCustomerProfileRow,
  emptyCustomerSavedConsignee,
  emptyCustomerSavedGoods,
  emptyCustomerSavedShipper,
  emptyCustomerSavedVehicle,
} from "./customerDirectoryProfile";
import { normalizeAgentCode } from "./customerProfileInputFormat";

/** Khách mới: có sẵn 1 người gửi mặc định để nhập ngay, không cần bấm thêm. */
export function scaffoldNewCustomer(id: string): CustomerDirectoryEntry {
  const shipper = emptyCustomerSavedShipper();
  return {
    ...emptyCustomerProfileRow(id),
    savedShippers: [shipper],
    defaultShipperId: shipper.id,
  };
}

/** Khi mở khách cũ thiếu hồ sơ — thêm khung trống để nhập liền. */
export function ensureCustomerEditScaffold(entry: CustomerDirectoryEntry): CustomerDirectoryEntry {
  let next = entry;
  if (!(next.savedShippers?.length ?? 0)) {
    const shipper = emptyCustomerSavedShipper();
    next = { ...next, savedShippers: [shipper], defaultShipperId: shipper.id };
  }
  return next;
}

/** Gợi ý nhãn ngắn khi để trống — lấy từ tên hoặc mã khách. */
export function suggestSavedItemLabel(primaryName: string, customerCode: string): string {
  const fromCode = normalizeAgentCode(customerCode);
  if (fromCode) return fromCode.slice(0, 12);
  const words = primaryName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return normalizeAgentCode(words[0]!).slice(0, 12);
  return normalizeAgentCode(`${words[0]!.slice(0, 3)}${words[words.length - 1]!.slice(0, 3)}`).slice(0, 12);
}

export function withNewDefault<T extends { id: string }>(
  list: T[],
  item: T,
  currentDefaultId: string | undefined
): { list: T[]; defaultId: string | undefined } {
  const nextList = [...list, item];
  return {
    list: nextList,
    defaultId: nextList.length === 1 ? item.id : currentDefaultId,
  };
}

export { emptyCustomerSavedConsignee, emptyCustomerSavedGoods, emptyCustomerSavedShipper, emptyCustomerSavedVehicle };
