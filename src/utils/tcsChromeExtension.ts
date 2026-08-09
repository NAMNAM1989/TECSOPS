import type { EsidDeclareFillPayload } from "./buildEsidDeclareFillPayload";
import type { EcargoVctFillPayload } from "./buildEcargoVctFillPayload";
import type { TcsEsidScanItem } from "./tcsPortalAgentApi";

/** Ext TECS-TCS ESID. */
export const TCS_EXT_CHANNEL = "tecsops-tcs-ext";
/** Ext kho TCS ESID — tài khoản / session độc lập. */
export const TCS_EXT_CHANNEL_DIRECT = "tecsops-tcs-direct-ext";
/** Ext kho SCSC eCargo VCT. */
export const TCS_EXT_CHANNEL_SCSC = "tecsops-scsc-ecargo-ext";

/** Alias cũ — giữ tương thích import. */
export const TCS_EXT_CHANNEL_HUB = TCS_EXT_CHANNEL;

/** Kho portal ESID. */
export type TcsPortalExtWarehouse = "TECS-TCS" | "TCS";
/** Mục tiêu channel Ops → Ext (ESID + eCargo). */
export type TcsExtChannelTarget = TcsPortalExtWarehouse | "SCSC";

export function tcsExtChannelForWarehouse(
  warehouse: TcsExtChannelTarget = "TECS-TCS"
): string {
  if (warehouse === "TCS") return TCS_EXT_CHANNEL_DIRECT;
  if (warehouse === "SCSC") return TCS_EXT_CHANNEL_SCSC;
  return TCS_EXT_CHANNEL;
}

export type TcsExtensionWorkspace = {
  logged_in_username?: string;
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
  portalWarehouse?: TcsExtChannelTarget;
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
  /** User kỳ vọng — Ext từ chối Quét nếu session cookie đang là user kho kia. */
  expected_username?: string;
  agent_base_url?: string;
};

export type TcsExtBootstrapResult = TcsExtResult & {
  logged_in?: boolean;
  ready?: TcsEsidScanItem[];
  items?: TcsEsidScanItem[];
  total?: number;
  list_total?: number;
  reception_total?: number;
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

export type TcsExtDownloadPdfResult = TcsExtResult & {
  awb?: string;
  pdf_name?: string;
  /** Base64 PDF (không có prefix data:) — Ops tạo blob tải về. */
  pdf_base64?: string;
  downloaded?: boolean;
};

type ExtensionCommand =
  | "PING"
  | "TCS_OPEN"
  | "TCS_BOOTSTRAP"
  | "TCS_SCAN_DATE"
  | "TCS_INVALIDATE_SESSION"
  | "FILL_ESID"
  | "DOWNLOAD_ESID_PDF"
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

const ALL_CHANNELS = new Set([
  TCS_EXT_CHANNEL,
  TCS_EXT_CHANNEL_DIRECT,
  TCS_EXT_CHANNEL_SCSC,
]);

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
      !data.channel ||
      !ALL_CHANNELS.has(data.channel) ||
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

function extTimeoutMessage(target: TcsExtChannelTarget): string {
  if (target === "TCS") {
    return "Không nhận được phản hồi từ Chrome extension kho TCS. Cài Ext «TECSOPS — Kho TCS ESID», Reload rồi F5 Ops.";
  }
  if (target === "SCSC") {
    return "Không nhận được phản hồi từ Chrome extension SCSC eCargo. Cài Ext «TECSOPS — Kho SCSC eCargo», Reload rồi F5 Ops.";
  }
  return "Không nhận được phản hồi từ Chrome extension TECS-TCS ESID. Hãy Reload extension và F5 trang Ops.";
}

function request<T extends TcsExtResult>(
  type: ExtensionCommand,
  payload?: unknown,
  timeoutMs = 60_000,
  warehouse: TcsExtChannelTarget = "TECS-TCS"
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
  warehouse?: TcsExtChannelTarget;
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

/** Kho TCS: tải PDF ESID qua Ext (không Playwright). */
export function downloadEsidPdfViaExtension(
  payload: { awb: string },
  opts?: TcsExtRequestOpts
): Promise<TcsExtDownloadPdfResult> {
  const warehouse = opts?.warehouse ?? "TCS";
  return request<TcsExtDownloadPdfResult>(
    "DOWNLOAD_ESID_PDF",
    payload,
    180_000,
    warehouse
  );
}

export function openTcsExtensionTab(
  opts?: TcsExtRequestOpts
): Promise<TcsExtResult> {
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtResult>("TCS_OPEN", undefined, 20_000, warehouse);
}

/** Đổi kho Ops → hủy cờ logged_in của Ext (cookie tcs.com.vn dùng chung 2 Ext). */
export function invalidateTcsExtensionSession(
  opts?: TcsExtRequestOpts
): Promise<TcsExtResult> {
  const warehouse = opts?.warehouse ?? "TECS-TCS";
  return request<TcsExtResult>(
    "TCS_INVALIDATE_SESSION",
    undefined,
    8_000,
    warehouse
  );
}

export function fillEcargoVctViaExtension(
  payload: EcargoVctFillPayload
): Promise<TcsExtFillResult> {
  return request<TcsExtFillResult>(
    "FILL_ECARGO_VCT",
    payload,
    120_000,
    "SCSC"
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
    "SCSC"
  );
}

export function openEcargoExtensionTab(): Promise<TcsExtResult> {
  return request<TcsExtResult>("ECARGO_OPEN", undefined, 20_000, "SCSC");
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
    "SCSC"
  );
}
