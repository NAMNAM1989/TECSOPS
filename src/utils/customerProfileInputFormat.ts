import type { CustomerSavedShipper } from "../types/customerDirectory";

/** Payload OCR / Telegram bot / DeepSeek Vision — patch shipper form. */
export type CustomerProfileOcrPayload = {
  shipperName?: string;
  shipperAddress?: string;
  taxCode?: string;
  shipperPhone?: string;
  shipperEmail?: string;
  label?: string;
};

/** Viết hoa mã (agent code, mã khách): `ctl` → `CTL`. */
export function normalizeAgentCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Định dạng SĐT VN: `02836363967` → `028.3636.3967`. */
export function formatVnPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 7)}.${digits.slice(7)}`;
}

export function patchShipperFromOcr(
  _current: CustomerSavedShipper,
  ocr: CustomerProfileOcrPayload
): Partial<CustomerSavedShipper> {
  const patch: Partial<CustomerSavedShipper> = {};
  if (ocr.label?.trim()) patch.label = normalizeAgentCode(ocr.label);
  if (ocr.shipperName?.trim()) patch.shipperName = ocr.shipperName.trim();
  if (ocr.shipperAddress?.trim()) patch.shipperAddress = ocr.shipperAddress.trim();
  if (ocr.taxCode?.trim()) patch.taxCode = ocr.taxCode.trim();
  if (ocr.shipperPhone?.trim()) patch.shipperPhone = formatVnPhoneDisplay(ocr.shipperPhone);
  if (ocr.shipperEmail?.trim()) patch.shipperEmail = ocr.shipperEmail.trim();
  return patch;
}

/** Parse JSON OCR từ clipboard / bot — trả null nếu không hợp lệ. */
export function parseCustomerProfileOcrJson(raw: string): CustomerProfileOcrPayload | null {
  try {
    const j = JSON.parse(raw.trim()) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    return j as CustomerProfileOcrPayload;
  } catch {
    return null;
  }
}
