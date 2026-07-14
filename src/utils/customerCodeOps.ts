import { normalizeAgentCode } from "./customerProfileInputFormat";

/** Prefix mã khách (customs_ops): 2–5 chữ A–Z. */
export const CUSTOMER_PREFIX_MIN = 2;
export const CUSTOMER_PREFIX_MAX = 5;
export const CUSTOMER_SHORT_CODE_MAX = 10;
export const CUSTOMER_CODE_SEQ_WIDTH = 6;

export function normalizeCustomerPrefix(raw: string): string {
  return String(raw ?? "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, CUSTOMER_PREFIX_MAX);
}

export function isValidCustomerPrefix(raw: string): boolean {
  const p = normalizeCustomerPrefix(raw);
  return p.length >= CUSTOMER_PREFIX_MIN && p.length <= CUSTOMER_PREFIX_MAX;
}

export function normalizeCustomerShortCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, CUSTOMER_SHORT_CODE_MAX);
}

/** Suy Prefix từ mã hiện có (vd. ABC000001 → ABC, GLO → GLO). */
export function inferPrefixFromCustomerCode(code: string): string {
  const c = normalizeAgentCode(code);
  if (!c) return "";
  const m = /^([A-Z]{2,5})(?=\d|$)/.exec(c);
  if (!m) return "";
  return normalizeCustomerPrefix(m[1]!);
}

/** Sinh mã tiếp theo: GLO → GLO000001, GLO000001 tồn tại → GLO000002. */
export function allocateNextCustomerCode(
  prefix: string,
  existingCodes: Iterable<string>
): string {
  const p = normalizeCustomerPrefix(prefix);
  if (!isValidCustomerPrefix(p)) {
    throw new Error("Prefix phải gồm 2–5 chữ cái A–Z.");
  }
  const re = new RegExp(`^${p}(\\d{1,10})$`, "i");
  let max = 0;
  for (const raw of existingCodes) {
    const code = normalizeAgentCode(raw);
    const m = re.exec(code);
    if (m) max = Math.max(max, Number.parseInt(m[1]!, 10));
  }
  return `${p}${String(max + 1).padStart(CUSTOMER_CODE_SEQ_WIDTH, "0")}`;
}

/**
 * Đảm bảo có mã khách trước khi lưu:
 * - đã có code → giữ
 * - trống code + prefix hợp lệ → cấp số mới
 */
export function ensureCustomerCodeForSave(
  entry: { code: string; prefix?: string },
  otherCodes: Iterable<string>
): { code: string; prefix: string } {
  const prefix =
    normalizeCustomerPrefix(entry.prefix ?? "") || inferPrefixFromCustomerCode(entry.code);
  let code = normalizeAgentCode(entry.code);
  if (!code) {
    if (!isValidCustomerPrefix(prefix)) {
      throw new Error("Thiếu Customer Code — cần Prefix (2–5 chữ) để hệ thống tự sinh mã.");
    }
    code = allocateNextCustomerCode(prefix, otherCodes);
  }
  return { code, prefix: prefix || inferPrefixFromCustomerCode(code) };
}
