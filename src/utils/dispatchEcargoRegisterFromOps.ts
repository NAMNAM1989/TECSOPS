import type { EcargoRegisterFromOpsMessage } from "../types/ecargo";

const EVENT_NAME = "ECARGO_REGISTER_FROM_OPS";

/**
 * Gửi payload tới Chrome Extension eCargo Auto.
 *
 * - **CustomEvent** trên `window` (theo spec OPS) — một số bridge script chỉ bắt sự kiện DOM.
 * - **window.postMessage** cùng payload — MV3 content script chạy isolated thường không thấy
 *   `CustomEvent` của trang; extension inject page-world có thể `addEventListener("message")`.
 *
 * Extension nên lọc `event.data?.type === "ECARGO_REGISTER_FROM_OPS"` và/hoặc bắt `EVENT_NAME`.
 */
export function dispatchEcargoRegisterFromOps(envelope: EcargoRegisterFromOpsMessage): void {
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: envelope,
        bubbles: true,
        composed: true,
      })
    );
  } catch {
    /* noop */
  }
  try {
    window.postMessage(envelope, "*");
  } catch {
    /* noop */
  }
}
