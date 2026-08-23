import type { TcsPortalExtWarehouse } from "./tcsChromeExtension";
import { isPortalBusyExtError, type TcsExtResult } from "./tcsChromeExtension";

/**
 * Kho portal cho 1-Click Điền từ danh bạ.
 * Không hardcode TECS-TCS — caller chọn / nhớ prefs.
 */
export function resolveQuickFillWarehouse(
  selected: string | null | undefined,
  fallback: TcsPortalExtWarehouse = "TECS-TCS"
): TcsPortalExtWarehouse {
  const wh = String(selected || "").trim().toUpperCase();
  if (wh === "TCS") return "TCS";
  if (wh === "TECS-TCS") return "TECS-TCS";
  return fallback;
}

export function quickFillNeedsLoginError(result: TcsExtResult | undefined): boolean {
  const code = String(result?.error || "");
  return (
    code === "NEEDS_LOGIN" ||
    code === "NEED_LOGIN" ||
    code === "WRONG_USER" ||
    code === "CREDENTIALS_REQUIRED"
  );
}

export function formatQuickFillError(
  result: { ok?: boolean; error?: string; message?: string } | undefined
): string {
  if (!result) return "Điền eSID thất bại.";
  if (isPortalBusyExtError(result as TcsExtResult)) {
    return result.message || "Portal TCS đang bận — thử lại sau vài giây.";
  }
  return (
    result.message ||
    result.error ||
    "Điền eSID thất bại. Đảm bảo đã Đăng Nhập TCS đúng kho trên Chrome Ext."
  );
}
