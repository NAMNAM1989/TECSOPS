import type { CustomerSavedConsignee } from "../types/customerDirectory";
import type { Shipment } from "../types/shipment";
import { normalizePrintAddressMultiline } from "./printAddressMultiline";

function compactPrintText(v: string, max: number): string {
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Gán / xóa CNEE lưu sẵn lên lô (snapshot in + `customerConsigneeId`). */
export function buildShipmentPatchForSavedConsignee(
  sc: CustomerSavedConsignee | undefined
): Partial<Shipment> {
  if (!sc) {
    return {
      customerConsigneeId: "",
      consigneeNamePrint: "",
      consigneeAddressPrint: "",
      consigneePhonePrint: "",
      consigneeEmailPrint: "",
      notifyNamePrint: "",
    };
  }
  return {
    customerConsigneeId: sc.id,
    consigneeNamePrint: compactPrintText(sc.consigneeName, 45),
    consigneeAddressPrint: normalizePrintAddressMultiline(sc.consigneeAddress, 6).slice(0, 300),
    consigneePhonePrint: compactPrintText(sc.consigneePhone, 24),
    consigneeEmailPrint: compactPrintText(sc.consigneeEmail, 50),
    notifyNamePrint: compactPrintText(sc.notifyName, 80),
  };
}

/** Nhãn đầy đủ — dùng form/modal danh bạ. */
export function formatSavedConsigneeOptionLabel(sc: CustomerSavedConsignee): string {
  const label = sc.label.trim();
  const name = sc.consigneeName.trim();
  if (label && name) return `${label} — ${name}`;
  return label || name || sc.id;
}

/** Mã / tên ngắn trên lưới — không ghép label + tên pháp lý. */
export function formatSavedConsigneeShortLabel(sc: CustomerSavedConsignee): string {
  const label = sc.label.trim();
  if (label) return label;
  const name = sc.consigneeName.trim();
  if (!name) return sc.id;
  return name.length > 24 ? `${name.slice(0, 22)}…` : name;
}

/** Tooltip / pop-up: tên pháp lý đầy đủ (tránh lặp WOO-HO — WOO-HO …). */
export function formatSavedConsigneeDetailTitle(sc: CustomerSavedConsignee): string {
  const label = sc.label.trim();
  const name = sc.consigneeName.trim();
  if (!label) return name;
  if (!name) return label;
  if (name.toUpperCase().startsWith(label.toUpperCase())) return name;
  return `${label} — ${name}`;
}
