import type { TcsPortalJobPayload, TcsPortalWarehouse } from "./tcsPortalJob";
import { getPortalPlaywrightLocal } from "./portalPlaywrightLocal";
import {
  agentFetchViaExtension,
  type TcsPortalExtWarehouse,
} from "./tcsChromeExtension";
import { extensionOcrBaseUrl } from "./tcsOcrAgentEndpoints";

/** localStorage override — IP/tunnel tùy chỉnh */
const TCS_AGENT_URL_LS_KEY = "tecsops-tcs-agent-url";

export type AgentWarehouseOpts = {
  warehouse?: TcsPortalWarehouse | string;
};

function asExtWarehouse(warehouse?: string | null): TcsPortalExtWarehouse {
  return String(warehouse || "")
    .trim()
    .toUpperCase() === "TCS"
    ? "TCS"
    : "TECS-TCS";
}

function warehouseHeader(
  warehouse?: string | null
): Record<string, string> {
  const wh = String(warehouse || "").trim().toUpperCase();
  if (wh === "TCS" || wh === "TECS-TCS") {
    return { "X-Portal-Warehouse": wh };
  }
  return {};
}

/**
 * Mặc định: same-origin `/tcs-agent` (Vite/Express proxy → Playwright trên máy kho).
 * Máy khác mở Ops qua IP máy kho vẫn tới đúng agent; không hardcode 127.0.0.1.
 */
function defaultAgentBase(): string {
  const fromEnv = String(import.meta.env.VITE_TCS_AGENT_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/tcs-agent`;
  }
  return "/tcs-agent";
}

export type TcsAgentSession = {
  open?: boolean;
  logged_in?: boolean;
  needs_login?: boolean;
  url?: string;
  awb_locators_confirmed?: boolean;
  message?: string;
  /** true = Chrome không có cửa sổ (Railway); false = headed máy kho */
  headless?: boolean;
  /** true = đã mở được cửa sổ OS thật */
  visible_ok?: boolean;
  preview_file?: string | null;
  preview_url?: string | null;
  browser_engine?: string;
};

export type TcsAgentHealth = {
  ok: boolean;
  service?: string;
  version?: string;
  warehouse_scope?: string;
  mock?: boolean;
  dry_run?: boolean;
  /** Agent chạy headless (container) hay headed (máy kho có màn hình) */
  headless?: boolean;
  running?: boolean;
  docs_dir?: string;
  session?: TcsAgentSession;
  workspace?: TcsWorkspaceStatus;
  prepared_awb?: string | null;
  preparing_awb?: string | null;
};

export type TcsWorkspaceStatus = {
  phase: "IDLE" | "OPENING" | "NEEDS_LOGIN" | "SCANNING" | "READY" | "ERROR" | string;
  session_date?: string;
  awb_count?: number;
  cache_count?: number;
  ready_count?: number;
  scan_total?: number;
  scanned_at?: number | null;
  cache_age_seconds?: number | null;
  cache_fresh?: boolean;
  error?: string;
};

export type TcsAgentJobResultRow = {
  stt: number;
  awb: string;
  action: string;
  normalized_status: string;
  tcs_status_raw?: string;
  downloaded_file?: string;
  download_url?: string;
  pdf_name?: string;
  print_status?: string;
  cache_hit?: boolean;
  hot_path?: boolean;
  error_code?: string;
  error_message?: string;
  shipment_id?: string;
};

export type TcsAgentJobResponse = {
  ok: boolean;
  job_id?: string;
  total?: number;
  ok_count?: number;
  downloaded_count?: number;
  not_completed?: number;
  errors?: number;
  report_path?: string;
  docs_dir?: string;
  mock?: boolean;
  hot_path?: boolean;
  cache_hit?: boolean;
  results?: TcsAgentJobResultRow[];
  error?: string;
  message?: string;
};

function agentBase(): string {
  try {
    const fromLs = localStorage.getItem(TCS_AGENT_URL_LS_KEY);
    if (fromLs?.trim()) return fromLs.trim().replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return defaultAgentBase();
}

export function setTcsAgentBaseUrl(url: string): string {
  const cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned) {
    try {
      localStorage.removeItem(TCS_AGENT_URL_LS_KEY);
    } catch {
      /* ignore */
    }
    return defaultAgentBase();
  }
  try {
    localStorage.setItem(TCS_AGENT_URL_LS_KEY, cleaned);
  } catch {
    /* ignore */
  }
  return cleaned;
}

export function clearTcsAgentBaseUrl(): string {
  return setTcsAgentBaseUrl("");
}

export function agentOfflineHint(base = agentBase()): string {
  if (getPortalPlaywrightLocal()) {
    return (
      "Agent headed local offline. Chạy `npm run portal:headed:local` trên máy này, " +
      "Reload Ext, bật «PW local», rồi thử lại."
    );
  }
  const isLoopback = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(base);
  const isProxy = base.includes("/tcs-agent") || base.endsWith("/tcs-agent");
  if (isProxy) {
    return (
      `Agent Offline (${base}). Online: kiểm tra Railway service đang chạy + TCS_AGENT_PROXY=1 ` +
      `(Playwright headless trong container). Local: npm run tcs:agent:real hoặc npm run portal:start:both.`
    );
  }
  if (isLoopback) {
    return (
      `Agent Offline (${base}). Local: chạy agent trên máy này. ` +
      `Online: mở Ops trên domain Railway (same-origin /tcs-agent), không hardcode 127.0.0.1.`
    );
  }
  return `Agent Offline (${base}). Kiểm tra Railway/agent URL và firewall.`;
}

type AgentJsonEnvelope = {
  ok: boolean;
  error?: string;
  message?: string;
};

function agentPathTimeoutMs(path: string): number {
  const p = path.toLowerCase();
  if (
    p.includes("/workspace/") ||
    p.includes("/jobs") ||
    p.includes("/esid/") ||
    p.includes("/session/open")
  ) {
    return 360_000;
  }
  return 60_000;
}

async function postAgentJsonViaExt<T extends AgentJsonEnvelope>(
  path: string,
  body: unknown,
  fallbackMessage: string,
  opts: AgentWarehouseOpts = {}
): Promise<T> {
  const wh = asExtWarehouse(opts.warehouse);
  const res = await agentFetchViaExtension(
    {
      path,
      method: "POST",
      body,
      timeoutMs: agentPathTimeoutMs(path),
      agentBaseUrl: extensionOcrBaseUrl(wh),
    },
    { warehouse: wh }
  );
  if (!res.ok && !(res.data && typeof res.data === "object")) {
    return {
      ok: false,
      error: res.error || "AGENT_OFFLINE",
      message:
        res.message ||
        agentOfflineHint(extensionOcrBaseUrl(wh)) ||
        fallbackMessage,
    } as T;
  }
  const parsed = {
    ...(typeof res.data === "object" && res.data ? res.data : {}),
    ...res,
  } as T & { data?: unknown };
  delete (parsed as { data?: unknown }).data;
  if (parsed.ok === false) {
    return {
      ...parsed,
      ok: false,
      error: parsed.error || res.error || "AGENT_ERROR",
      message: parsed.message || res.message || fallbackMessage,
    };
  }
  return parsed;
}

/** Một đường xử lý chung cho mọi POST agent: offline, bad JSON và HTTP error. */
async function postAgentJson<T extends AgentJsonEnvelope>(
  path: string,
  body: unknown,
  fallbackMessage: string,
  opts: AgentWarehouseOpts = {}
): Promise<T> {
  if (getPortalPlaywrightLocal()) {
    return postAgentJsonViaExt<T>(path, body, fallbackMessage, opts);
  }
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...warehouseHeader(opts.warehouse),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
    } as T;
  }
  let parsed: T;
  try {
    parsed = (await res.json()) as T;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
    } as T;
  }
  if (!res.ok || parsed.ok === false) {
    return {
      ...parsed,
      ok: false,
      error: parsed.error || `HTTP_${res.status}`,
      message: parsed.message || fallbackMessage,
    };
  }
  return parsed;
}

export async function pingTcsAgent(
  timeoutMs = 3500,
  opts: AgentWarehouseOpts = {}
): Promise<TcsAgentHealth | null> {
  if (getPortalPlaywrightLocal()) {
    const wh = asExtWarehouse(opts.warehouse);
    const res = await agentFetchViaExtension(
      {
        path: "/health",
        method: "GET",
        timeoutMs: Math.max(timeoutMs, 3_500),
        agentBaseUrl: extensionOcrBaseUrl(wh),
      },
      { warehouse: wh }
    );
    if (!res.ok) return null;
    const body = {
      ...(typeof res.data === "object" && res.data ? res.data : {}),
      ...res,
    } as TcsAgentHealth & { data?: unknown; error?: string };
    delete (body as { data?: unknown }).data;
    if (body.ok === false) return null;
    return body;
  }
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${agentBase()}/health`, {
      signal: ctrl.signal,
      headers: warehouseHeader(opts.warehouse),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as TcsAgentHealth & { error?: string };
    // Proxy Express/Vite khi agent chết trả 502 JSON { ok:false, error:AGENT_OFFLINE }
    if (body && body.ok === false) return null;
    return body;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

export async function fetchTcsSessionStatus(
  opts: AgentWarehouseOpts = {}
): Promise<TcsAgentSession | null> {
  try {
    const res = await fetch(`${agentBase()}/session/status`, {
      headers: warehouseHeader(opts.warehouse),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as TcsAgentSession & { ok?: boolean };
    return body;
  } catch {
    return null;
  }
}

/** Mở Chrome agent (Playwright). Ext Đồng bộ ≠ session agent — PDF vẫn cần bước này. */
export async function openTcsAgentSession(opts: {
  visible?: boolean;
  warehouse?: TcsPortalWarehouse | string;
} = {}): Promise<TcsAgentSession & { ok: boolean; error?: string; message?: string }> {
  const visible = opts.visible === true;
  return postAgentJson(
    "/session/open",
    {
      visible,
      headed: visible,
      show_browser: visible,
    },
    "Không mở được phiên Chrome agent TCS",
    { warehouse: opts.warehouse }
  );
}

export type TcsEsidScanItem = {
  awb: string;
  awb_last8?: string;
  ready: boolean;
  normalized_status?: string;
  tcs_status?: string;
  flight?: string;
  flight_date?: string;
  esid_code?: string;
  raw?: string;
  error?: string;
};

export type TcsEsidScanResponse = {
  ok: boolean;
  items?: TcsEsidScanItem[];
  ready?: TcsEsidScanItem[];
  total?: number;
  ready_count?: number;
  list_total?: number;
  reception_total?: number;
  error?: string;
  message?: string;
  workspace?: TcsWorkspaceStatus;
};

export type TcsWorkspaceBootstrapResponse = TcsEsidScanResponse &
  TcsAgentSession & {
    ok: boolean;
    scan_ok?: boolean;
    scan_error?: string;
    workspace?: TcsWorkspaceStatus;
    warnings?: string[];
  };

/** Login một lần → quét sẵn theo ngày → warm page KHAI BÁO cùng session. */
export async function bootstrapTcsWorkspace(
  sessionDate: string,
  awbs: string[],
  opts: {
    visible?: boolean;
    warehouse?: TcsPortalWarehouse | string;
    /** Mặc định false — Quét nhẹ. Bật khi cần prefetch/warm. */
    prefetch?: boolean;
    warm?: boolean;
  } = {}
): Promise<TcsWorkspaceBootstrapResponse> {
  const warehouse = opts.warehouse || "TECS-TCS";
  return postAgentJson<TcsWorkspaceBootstrapResponse>(
    "/workspace/bootstrap",
    {
      warehouse,
      session_date: sessionDate,
      awbs,
      visible: opts.visible === true,
      prefetch: opts.prefetch === true,
      warm: opts.warm === true,
    },
    "Không khởi tạo được workspace TCS",
    { warehouse }
  );
}

/** Quét HT nhẹ — không prefetch PDF / warm declare. */
export async function scanTcsWorkspace(
  sessionDate: string,
  awbs: string[],
  opts: { visible?: boolean; warehouse?: TcsPortalWarehouse | string } = {}
): Promise<TcsWorkspaceBootstrapResponse> {
  const warehouse = opts.warehouse || "TECS-TCS";
  try {
    return await postAgentJson<TcsWorkspaceBootstrapResponse>(
      "/workspace/scan",
      {
        warehouse,
        session_date: sessionDate,
        awbs,
        visible: opts.visible === true,
      },
      "Không quét được workspace TCS",
      { warehouse }
    );
  } catch {
    // Agent cũ chưa có /workspace/scan → bootstrap nhẹ (không prefetch/warm).
    return bootstrapTcsWorkspace(sessionDate, awbs, {
      ...opts,
      prefetch: false,
      warm: false,
    });
  }
}

/** In sẵn PDF ESID vào cache agent (sau Đồng bộ Ext hoặc gọi tay). */
export async function prefetchTcsPdfs(
  awbs: string[],
  opts: { limit?: number; warehouse?: TcsPortalWarehouse | string } = {}
): Promise<{
  ok: boolean;
  prefetched?: number;
  skipped?: number;
  failed?: number;
  error?: string;
  message?: string;
}> {
  const warehouse = opts.warehouse || "TECS-TCS";
  try {
    return await postAgentJson(
      "/workspace/prefetch-pdfs",
      {
        warehouse,
        awbs,
        limit: opts.limit ?? 5,
      },
      "Prefetch PDF thất bại",
      { warehouse }
    );
  } catch (e) {
    return {
      ok: false,
      error: "PREFETCH_FAILED",
      message: e instanceof Error ? e.message : "Prefetch PDF thất bại",
    };
  }
}

/**
 * Chỉ lấy AWB agent xác nhận ready + RECEPTION_COMPLETED.
 * Không đọc raw/message (tránh khớp nhầm cụm «Hoàn thành tiếp nhận» trong lỗi).
 */
export function pickEsidScanReadyItems(
  res: Pick<TcsEsidScanResponse, "ready" | "items">
): TcsEsidScanItem[] {
  const map = new Map<string, TcsEsidScanItem>();
  for (const r of [...(res.ready || []), ...(res.items || [])]) {
    if (!r?.ready || r.normalized_status !== "RECEPTION_COMPLETED") continue;
    const d = String(r.awb || "").replace(/\D/g, "").slice(0, 11);
    if (d.length === 11) map.set(d, { ...r, awb: d, ready: true });
  }
  return [...map.values()];
}

export type TcsEsidDeclareFillResponse = {
  ok: boolean;
  awb?: string;
  submitted?: boolean;
  fills?: Record<string, unknown>;
  values?: Record<string, unknown>;
  warnings?: string[];
  message?: string;
  error?: string;
  elapsed_ms?: number;
  shipment_id?: string;
  /** Tên file trong output/docs — load qua GET /docs?file= */
  preview_file?: string | null;
  preview_url?: string | null;
  preview_error?: string;
  headless?: boolean;
  browser_focused?: boolean;
  timings?: {
    ops_text_ms?: number;
    flight_ms?: number;
    selects_ms?: number;
    party_ms?: number;
    total_ms?: number;
  };
};

export type TcsEsidDeclareSubmitResponse = {
  ok: boolean;
  awb?: string;
  form_awb?: string;
  submitted?: boolean;
  agree_ticked?: boolean;
  warnings?: string[];
  message?: string;
  error?: string;
  elapsed_ms?: number;
  shipment_id?: string;
  preview_file?: string | null;
  preview_url?: string | null;
};

/** Điền form KHAI BÁO ESID từ Ops — không HOÀN TẤT. */
export async function declareFillTcsEsid(
  payload: import("./buildEsidDeclareFillPayload").EsidDeclareFillPayload,
  opts: AgentWarehouseOpts = {}
): Promise<TcsEsidDeclareFillResponse> {
  const warehouse =
    opts.warehouse ||
    (payload as { warehouse?: string }).warehouse ||
    "TECS-TCS";
  return postAgentJson<TcsEsidDeclareFillResponse>(
    "/esid/declare-fill",
    { ...payload, warehouse },
    "Điền ESID thất bại",
    { warehouse }
  );
}

/** HOÀN TẤT form KHAI BÁO đang mở trên agent — bắt buộc confirm_submit. */
export async function declareSubmitTcsEsid(opts: {
  awb: string;
  shipment_id?: string;
  confirm_submit: true;
  warehouse?: TcsPortalWarehouse | string;
}): Promise<TcsEsidDeclareSubmitResponse> {
  const warehouse = opts.warehouse || "TECS-TCS";
  return postAgentJson<TcsEsidDeclareSubmitResponse>(
    "/esid/declare-submit",
    {
      warehouse,
      awb: opts.awb,
      shipment_id: opts.shipment_id || undefined,
      confirm_submit: true,
    },
    "HOÀN TẤT ESID thất bại",
    { warehouse }
  );
}

export async function submitTcsPortalJob(
  payload: TcsPortalJobPayload
): Promise<TcsAgentJobResponse> {
  return postAgentJson<TcsAgentJobResponse>(
    "/jobs",
    payload,
    "Agent từ chối job",
    { warehouse: payload.warehouse }
  );
}

export function getTcsAgentBaseUrl(): string {
  return agentBase();
}

/** URL file trong output/docs (PDF hoặc ảnh preview) qua proxy /tcs-agent. */
export function tcsAgentDocUrl(nameOrPath: string): string {
  const name = nameOrPath.replace(/^.*[/\\]/, "");
  return `${agentBase()}/docs?file=${encodeURIComponent(name)}`;
}
/**
 * Tải PDF ESID về máy (Downloads) — không mở tab xem/in.
 *
 * Job agent thường > vài giây → mất user activation; `<a download>` bị Chrome bỏ qua.
 * Một lần fetch → blob URL dùng cho cả `<a download>` và iframe fallback (không tải mạng 2 lần).
 */
export async function downloadPdfFromAgent(
  pdfNameOrPath: string,
  opts: AgentWarehouseOpts = {}
): Promise<boolean> {
  const name = pdfNameOrPath.replace(/^.*[/\\]/, "");
  if (!name.toLowerCase().endsWith(".pdf")) return false;
  const docUrl = tcsAgentDocUrl(name);
  try {
    const res = await fetch(docUrl, {
      cache: "no-store",
      headers: warehouseHeader(opts.warehouse),
    });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) return false;

    const objectUrl = URL.createObjectURL(
      new Blob([buf], { type: "application/pdf" }),
    );
    try {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Fallback khi mất user activation: iframe cùng blob (không fetch lại)
      const iframe = document.createElement("iframe");
      iframe.setAttribute("hidden", "");
      iframe.setAttribute("aria-hidden", "true");
      iframe.src = objectUrl;
      document.body.appendChild(iframe);
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error("blob download failed");
    }
    return true;
  } catch {
    try {
      window.location.assign(docUrl);
      return true;
    } catch {
      return false;
    }
  }
}
