/**
 * Chế độ Playwright headed local trên máy kiểm soát.
 * Ops (Railway) → Ext → http://127.0.0.1:8765|8766 (không dùng agent headless cloud).
 */

const LS_KEY = "tecsops-portal-playwright-local";

/** Mặc định tắt — chỉ bật trên máy có agent headed + Ext. */
export function getPortalPlaywrightLocal(): boolean {
  try {
    const v = String(localStorage.getItem(LS_KEY) || "")
      .trim()
      .toLowerCase();
    return v === "1" || v === "true" || v === "on";
  } catch {
    return false;
  }
}

export function setPortalPlaywrightLocal(on: boolean): void {
  try {
    if (!on) {
      localStorage.removeItem(LS_KEY);
      return;
    }
    localStorage.setItem(LS_KEY, "1");
  } catch {
    /* ignore */
  }
}
