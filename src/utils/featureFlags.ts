import { useState, useEffect } from "react";

const UI_V2_STORAGE_KEY = "tecsops.ui.v2";
const UI_V2_EVENT_NAME = "tecsops:ui-v2-changed";

/**
 * Kiểm tra cờ UI v2 từ localStorage.
 * Bật khi localStorage['tecsops.ui.v2'] === 'true' hoặc '1', mặc định TẮT.
 */
export function isUiV2Enabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const val = window.localStorage.getItem(UI_V2_STORAGE_KEY);
    return val === "true" || val === "1";
  } catch {
    return false;
  }
}

/**
 * Bật hoặc tắt cờ UI v2 và dispatch custom event để reactive component tự update.
 */
export function setUiV2Enabled(enabled: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (enabled) {
      window.localStorage.setItem(UI_V2_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(UI_V2_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(UI_V2_EVENT_NAME, { detail: { enabled } }));
  } catch {
    // ignore
  }
}

/**
 * React hook phản ứng tức thì khi cờ UI v2 thay đổi (storage event hoặc toggle).
 */
export function useUiV2(): boolean {
  const [enabled, setEnabled] = useState(() => isUiV2Enabled());

  useEffect(() => {
    const handleUpdate = () => {
      setEnabled(isUiV2Enabled());
    };
    window.addEventListener("storage", handleUpdate);
    window.addEventListener(UI_V2_EVENT_NAME, handleUpdate);
    return () => {
      window.removeEventListener("storage", handleUpdate);
      window.removeEventListener(UI_V2_EVENT_NAME, handleUpdate);
    };
  }, []);

  return enabled;
}
