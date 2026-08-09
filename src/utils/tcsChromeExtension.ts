import type { EsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";
import type { EcargoVctFillPayload } from "./buildEcargoVctFillPayload";
import type { TcsEsidScanItem } from "./tcsPortalAgentApi";

/** Ext TECS-TCS (+ eCargo SCSC). */
export const TCS_EXT_CHANNEL = "tecsops-tcs-ext";
/** Ext kho TCS — tài khoản / session độc lập. */
export const TCS_EXT_CHANNEL_DIRECT = "tecsops-tcs-direct-ext";

/** Alias cũ — giữ tương thích import. */
export const TCS_EXT_CHANNEL_HUB = TCS_EXT_CHANNEL;

export type TcsPortalExtWarehouse = "TECS-TCS" | "TCS";

export function tcsExtChannelForWarehouse(
  warehouse: TcsPortalExtWarehouse = "TECS-TCS"
): string {
  return warehouse === "TCS" ? TCS_EXT_CHANNEL_DIRECT : TCS_EXT_CHANNEL;
}

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
  portalWarehouse?: TcsPortalExtWarehouse;
  workspace?: TcsExtensionWorkspace;
};

export type TcsExtBootstrapPayload = {
  username: string;
  password: string;
  remember: boolean;
  session_date: string;
  awbs: string[];
  agent_base_url?: string;
  /** true = chỉ login, không quét ngày. */
  login_only?: boolean;
};

export type TcsExtScanPayload = {
  session_date: string;
  awbs: string[];
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
  | "TCS_SCAN_DATE"
  | "FILL_ESID"
  | "FILL_ECARGO_VCT"
  | "REGISTER_ECARGO_VCT"
  | "ECARGO_LOOKUP_AGENT"
  | "ECARGO_OPEN";

type Pending = {
  resolve: (value: TcsExtResult) => void;
  timer: number;
  channel: string;
};

const pending = new Map<string, Pending>();
let listenerBound = false;

function ensureListener() {
  if (listenerBound || typeof window === "undefined") return;
  listenerBound = true;
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.origin && event.origin !== window.location.origin) return;
    const data = event.data as TcsExtResult & {
      channel?: string;
      direction?: string;
      id?: string;
    };
    if (
      !data ||
      (data.channel !== TCS_EXT_CHANNEL &&
        data.channel !== TCS_EXT_CHANNEL_DIRECT) ||
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
    if (item.channel !== data.channel) return;
    window.clearTimeout(item.timer);
    pending.delete(data.id);
    item.resolve(data);
  });
}

function extTimeoutMessage(warehouse: TcsPortalExtWarehouse): string {
  return warehouse === "TCS"
    ? "Không nhận được phản hồi từ Chrome extension kho TCS. Cài Ext «TECSOPS — Kho TCS ESID», Reload rồi F5 Ops."
    : "Không nhận được phản hồi từ Chrome extension TECSOPS. Hãy Reload extension và F5 trang Ops.";
}

function request<T extends TcsExtResult>(
  type: ExtensionCommand,
  payload?: unknown,
  timeoutMs = 60_000,
  warehouse: TcsPortalExtWarehouse = "TECS-TCS"
): Promise<T> {
  ensureListener();
  const channel = tcsExtChannelForWarehouse(warehouse);
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
        message: extTimeoutMessage(warehouse),
        portalWarehouse: warehouse,
      } as T);
    }, timeoutMs);
    pending.set(id, {
      resolve: resolve as (value: TcsExtResult) => void,
      timer,
      channel,
    });
    window.postMessage(
      {
        channel,
        direction: "to-ext",
        id,
        type,
        payload,
      },
      window.location.origin
    );
  });
}

export type TcsExtRequestOpts = {
  warehouse?: TcsPortalExtWarehouse;
};

export async function pingTcsExtension(
  timeoutMsOrOpts: number | TcsExtRequestOpts = 2_500,
  maybeOpts?: TcsExtRequestOpts
): Promise<TcsExtResult> {
  const timeoutMs =
    typeof timeoutMsOrOpts === "number" ? timeoutMsOrOpts : 2_500;
  const opts =
    typeof timeoutMsOrOpts === "number" ? maybeOpts : timeoutMsOrOpts;
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtResult>("PING", undefined, timeoutMs, warehouse);
}

export function bootstrapTcsExtension(
  payload: TcsExtBootstrapPayload,
  opts?: TcsExtRequestOpts
): Promise<TcsExtBootstrapResult> {
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtBootstrapResult>(
    "TCS_BOOTSTRAP",
    payload,
    180_000,
    warehouse
  );
}

/** Quét ngày trên Ext đã login — chỉ đối soát AWB gửi kèm. */
export function scanTcsExtensionDate(
  payload: TcsExtScanPayload,
  opts?: TcsExtRequestOpts
): Promise<TcsExtBootstrapResult> {
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtBootstrapResult>(
    "TCS_SCAN_DATE",
    payload,
    180_000,
    warehouse
  );
}

export function fillEsidViaExtension(
  payload: EsidDeclareFillPayload,
  opts?: TcsExtRequestOpts
): Promise<TcsExtFillResult> {
  const warehouse =
    opts?.warehouse ??
    (payload.warehouse === "TCS" ? "TCS" : "TECS-TCS");
  return request<TcsExtFillResult>("FILL_ESID", payload, 120_000, warehouse);
}

export function openTcsExtensionTab(
  opts?: TcsExtRequestOpts
): Promise<TcsExtResult> {
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtResult>("TCS_OPEN", undefined, 20_000, warehouse);
}

export function fillEcargoVctViaExtension(
  payload: EcargoVctFillPayload
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>(
    "FILL_ECARGO_VCT",
    payload,
    120_000,
    "TECS-TCS"
  );
}

/** 1-click: điền + Tạo phiếu + OTP mail + QR (timeout dài). */
export function registerEcargoVctViaExtension(
  payload: EcargoVctFillPayload & {
    apiBase: string;
    shipmentIds: string[];
  }
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>(
    "REGISTER_ECARGO_VCT",
    payload,
    360_000,
    "TECS-TCS"
  );
}

export function openEcargoExtensionTab(): Promise<TcsExtResult> {
  return request<TcsExtResult>("ECARGO_OPEN", undefined, 20_000, "TECS-TCS");
}

/** Tra cứu đại lý trên eCargo (API Customer/Agent). */
export function lookupEcargoAgentViaExtension(filter: string): Promise<
  TcsExtResult & {
    count?: number;
    exactCount?: number;
    items?: Array<{ name: string; code: string; val: string; label: string }>;
    exact?: Array<{ name: string; code: string; val: string; label: string }>;
  }
> {
  return request(
    "ECARGO_LOOKUP_AGENT",
    { filter, agentName: filter },
    45_000,
    "TECS-TCS"
  );
}
