import type { TcsExtResult } from "./tcsChromeExtension";
import { isPortalBusyExtError } from "./tcsChromeExtension";

/**
 * UI Quét: chỉ bắt ĐN khi Ext không còn username / logged_in.
 * Nếu còn username (kể cả session_dirty) → để Ext khôi phục jar.
 */
export function shouldPromptExtLoginBeforeScan(
  extension: TcsExtResult | null | undefined
): boolean {
  if (!extension?.ok) return false;
  const user = String(extension.workspace?.logged_in_username || "").trim();
  if (user) return false;
  return !extension.workspace?.logged_in;
}

/** Sau Quét Ext: mở form ĐN khi session thật sự thiếu / sai user. */
export function shouldOpenExtLoginAfterScanFailure(
  result: TcsExtResult | null | undefined
): boolean {
  if (!result || result.ok) return false;
  const err = String(result.error || "");
  return (
    err === "NEEDS_LOGIN" ||
    err === "WRONG_USER" ||
    err === "CREDENTIALS_REQUIRED"
  );
}

/**
 * PORTAL_BUSY: không fallback executor khác (tránh cắt cookie giữa chừng).
 * Trả message hiển thị; null = không phải busy.
 */
export function portalBusyUserMessage(
  result: TcsExtResult | null | undefined
): string | null {
  if (!result || !isPortalBusyExtError(result)) return null;
  return (
    result.message ||
    "Portal TCS đang bận (Ext kho khác đang chạy) — thử lại sau vài giây."
  );
}
