/**
 * Bridge Ops ↔ Chrome extension Điền ESID (content-ops postMessage).
 * Không cần Extension ID cố định khi dùng content script trên origin Ops.
 */

import type { EsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";

export const TCS_EXT_CHANNEL = "tecsops-tcs-ext";

export type TcsExtPingResult = {
  ok: boolean;
  version?: string;
  extensionId?: string;
  error?: string;
  message?: string;
};

export type TcsExtFillResult = {
  ok: boolean;
  error?: string;
  message?: string;
  warnings?: string[];
  fills?: Record<string, boolean | string | number | null | undefined>;
  values?: Record<string, string>;
  source?: string;
  /** Version content-tcs.js (vd. 1.1.0) — xác nhận đã Reload extension */
  scriptVersion?: string;
};

type Pending = {
  resolve: (v: TcsExtFillResult | TcsExtPingResult) => void;
  timer: number;
};

const pending = new Map<string, Pending>();
let listenerBound = false;
let lastReadyAt = 0;

function ensureListener() {
  if (listenerBound || typeof window === "undefined") return;
  listenerBound = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as {
      channel?: string;
      direction?: string;
      id?: string;
      type?: string;
      ok?: boolean;
      version?: string;
    };
    if (!data || data.channel !== TCS_EXT_CHANNEL || data.direction !== "from-ext") return;

    if (data.type === "EXT_READY") {
      lastReadyAt = Date.now();
      return;
    }

    if (!data.id) return;
    const p = pending.get(data.id);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.delete(data.id);
    p.resolve(data as TcsExtFillResult);
  });
}

function request<T extends TcsExtFillResult | TcsExtPingResult>(
  type: "PING" | "FILL_ESID",
  payload?: EsidDeclareFillPayload,
  timeoutMs = 60_000
): Promise<T> {
  ensureListener();
  return new Promise((resolve) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ext-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve({
        ok: false,
        error: "TIMEOUT",
        message:
          "Không thấy Chrome extension TECSOPS. Cài unpacked từ thư mục chrome-extension/ (xem README), bật extension, Login TCS, rồi thử lại.",
      } as T);
    }, timeoutMs);

    pending.set(id, {
      resolve: resolve as (v: TcsExtFillResult | TcsExtPingResult) => void,
      timer,
    });

    window.postMessage(
      {
        channel: TCS_EXT_CHANNEL,
        direction: "to-ext",
        id,
        type,
        payload,
      },
      "*"
    );
  });
}

/** Ping nhanh — extension có inject content-ops trên trang Ops không. */
export async function pingTcsExtension(timeoutMs = 2500): Promise<TcsExtPingResult> {
  ensureListener();
  // Nếu vừa nhận EXT_READY gần đây vẫn ping để lấy version
  const res = await request<TcsExtPingResult>("PING", undefined, timeoutMs);
  if (res.ok) lastReadyAt = Date.now();
  return res;
}

export async function isTcsExtensionAvailable(): Promise<boolean> {
  if (lastReadyAt && Date.now() - lastReadyAt < 15_000) {
    // vẫn verify nhẹ
  }
  const res = await pingTcsExtension(2000);
  return Boolean(res.ok);
}

export async function fillEsidViaExtension(
  payload: EsidDeclareFillPayload
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>("FILL_ESID", payload, 90_000);
}

export const TCS_EXT_INSTALL_HINT =
  "Cài Chrome extension TECSOPS (chrome-extension/ → Load unpacked), Login TCS trên Chrome này, rồi bấm Điền lại. Không dùng noVNC cho bước Điền.";
