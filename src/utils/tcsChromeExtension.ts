import type { EsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";
import type { EcargoVctFillPayload } from "./buildEcargoVctFillPayload";
import type { TcsEsidScanItem } from "./tcsPortalAgentApi";

export const TCS_EXT_CHANNEL = "tecsops-tcs-ext";

export type TcsExtensionWorkspace = {
  phase?: string;
  logged_in?: boolean;
  session_date?: string;
  cache_count?: number;
  cache_age_seconds?: number | null;
  ready_count?: number;
  tab_id?: number | null;
  message?: string;
  error?: string;
  updated_at?: number | null;
};

export type TcsExtResult = {
  ok: boolean;
  type?: string;
  version?: string;
  extensionId?: string;
  error?: string;
  message?: string;
  warnings?: string[];
  source?: string;
  scriptVersion?: string;
  workspace?: TcsExtensionWorkspace;
};

export type TcsExtBootstrapPayload = {
  username: string;
  password: string;
  remember: boolean;
  session_date: string;
  awbs: string[];
  agent_base_url?: string;
};

export type TcsExtBootstrapResult = TcsExtResult & {
  logged_in?: boolean;
  ready?: TcsEsidScanItem[];
  items?: TcsEsidScanItem[];
  total?: number;
  list_total?: number;
  cache_count?: number;
};

export type TcsExtFillResult = TcsExtResult & {
  fills?: Record<string, boolean | string | number | null | undefined>;
  values?: Record<string, string>;
  vctCode?: string;
  qrDataUrl?: string;
  phase?: string;
  sinceIso?: string;
  submit?: boolean;
};

type ExtensionCommand =
  | "PING"
  | "TCS_OPEN"
  | "TCS_BOOTSTRAP"
  | "FILL_ESID"
  | "FILL_ECARGO_VCT"
  | "REGISTER_ECARGO_VCT"
  | "ECARGO_OPEN";

type Pending = {
  resolve: (value: TcsExtResult) => void;
  timer: number;
};

const pending = new Map<string, Pending>();
let listenerBound = false;

function ensureListener() {
  if (listenerBound || typeof window === "undefined") return;
  listenerBound = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    // Chỉ nhận phản hồi phát ra từ chính trang Ops — chặn frame lạ giả mạo kết quả.
    if (event.origin && event.origin !== window.location.origin) return;
    const data = event.data as TcsExtResult & {
      channel?: string;
      direction?: string;
      id?: string;
    };
    if (
      !data ||
      data.channel !== TCS_EXT_CHANNEL ||
      data.direction !== "from-ext"
    ) {
      return;
    }
    if (data.type === "EXT_READY") {
      return;
    }
    if (!data.id) return;
    const item = pending.get(data.id);
    if (!item) return;
    window.clearTimeout(item.timer);
    pending.delete(data.id);
    item.resolve(data);
  });
}

function request<T extends TcsExtResult>(
  type: ExtensionCommand,
  payload?: unknown,
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
          "Không nhận được phản hồi từ Chrome extension TECSOPS. Hãy Reload extension và F5 trang Ops.",
      } as T);
    }, timeoutMs);
    pending.set(id, {
      resolve: resolve as (value: TcsExtResult) => void,
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
      window.location.origin
    );
  });
}

export async function pingTcsExtension(timeoutMs = 2_500): Promise<TcsExtResult> {
  return request<TcsExtResult>("PING", undefined, timeoutMs);
}

export function bootstrapTcsExtension(
  payload: TcsExtBootstrapPayload
): Promise<TcsExtBootstrapResult> {
  return request<TcsExtBootstrapResult>("TCS_BOOTSTRAP", payload, 180_000);
}

export function fillEsidViaExtension(
  payload: EsidDeclareFillPayload
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>("FILL_ESID", payload, 120_000);
}

export function openTcsExtensionTab(): Promise<TcsExtResult> {
  return request<TcsExtResult>("TCS_OPEN", undefined, 20_000);
}

export function fillEcargoVctViaExtension(
  payload: EcargoVctFillPayload
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>("FILL_ECARGO_VCT", payload, 120_000);
}

/** 1-click: điền + Tạo phiếu + OTP mail + QR (timeout dài). */
export function registerEcargoVctViaExtension(
  payload: EcargoVctFillPayload & {
    apiBase: string;
    shipmentIds: string[];
  }
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>("REGISTER_ECARGO_VCT", payload, 200_000);
}

export function openEcargoExtensionTab(): Promise<TcsExtResult> {
  return request<TcsExtResult>("ECARGO_OPEN", undefined, 20_000);
}
