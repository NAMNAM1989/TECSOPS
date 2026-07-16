import { normalizeAgentCode } from "./customerProfileInputFormat";

/** Customer Code khóa đồng bộ (mẫu mới): 2–5 chữ A–Z. */
export const CUSTOMER_SYNC_CODE_MIN = 2;
export const CUSTOMER_SYNC_CODE_MAX = 5;
export const CUSTOMER_SHORT_CODE_MAX = 10;

/**
 * Khóa khớp lỏng: bỏ dấu, khoảng trắng, dấu chấm…
 * VD: "CONG CHUA" / "CONGCHUA" / "CÔNG CHÚA" → "CONGCHUA"
 */
export function compactCustomerMatchKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Chuẩn hoá mã đồng bộ 2–5 chữ A–Z (Customer Code mẫu mới). */
export function normalizeCustomerSyncCode(raw: string): string {
  return String(raw ?? "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, CUSTOMER_SYNC_CODE_MAX);
}

export function isValidCustomerSyncCode(raw: string): boolean {
  const c = normalizeCustomerSyncCode(raw);
  return c.length >= CUSTOMER_SYNC_CODE_MIN && c.length <= CUSTOMER_SYNC_CODE_MAX;
}

/**
 * Short Code khi đang gõ — giữ khoảng trắng giữa từ (không trim đuôi).
 * VD: "CÔNG CHÚA", không thành "CÔNGCHÚA".
 */
export function shortCodeWhileTyping(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, CUSTOMER_SHORT_CODE_MAX);
}

/** Short Code khi lưu/import — trim + gộp khoảng trắng giữa từ. */
export function normalizeCustomerShortCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, CUSTOMER_SHORT_CODE_MAX);
}

/**
 * Suy khóa chữ từ mã hiện có — khớp khách cũ dạng GLO000001 khi import/export mã GLO.
 * (vd. ABC000001 → ABC, GLO → GLO)
 */
export function inferLetterKeyFromCustomerCode(code: string): string {
  const c = normalizeAgentCode(code);
  if (!c) return "";
  const m = /^([A-Z]{2,5})(?=\d|$)/.exec(c);
  if (!m) return "";
  return normalizeCustomerSyncCode(m[1]!);
}
