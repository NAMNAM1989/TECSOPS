import type { TcsPortalJobPayload } from "./tcsPortalJob";

/** localStorage override — IP/tunnel tùy chỉnh */
const TCS_AGENT_URL_LS_KEY = "tecsops-tcs-agent-url";

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
  const isLoopback = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(base);
  const isProxy = base.includes("/tcs-agent") || base.endsWith("/tcs-agent");
  if (isProxy) {
    return (
      `Agent Offline (${base}). Trên máy kho: restart npm run dev (tự chạy agent) hoặc npm run tcs:agent:real. ` +
      `Máy khác: mở Ops bằng IP máy kho (vd. http://192.168.x.x:5173), không dùng 127.0.0.1.`
    );
  }
  if (isLoopback) {
    return (
      `Agent Offline (${base}). 127.0.0.1 chỉ đúng trên máy đang chạy agent. ` +
      `Máy khác: xóa URL tùy chỉnh (nút URL → để trống = proxy /tcs-agent) và mở Ops qua IP máy kho.`
    );
  }
  return `Agent Offline (${base}). Kiểm tra agent đang chạy và URL/firewall.`;
}

type AgentJsonEnvelope = {
  ok: boolean;
  error?: string;
  message?: string;
};

/** Một đường xử lý chung cho mọi POST agent: offline, bad JSON và HTTP error. */
async function postAgentJson<T extends AgentJsonEnvelope>(
  path: string,
  body: unknown,
  fallbackMessage: string
): Promise<T> {
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

export async function pingTcsAgent(timeoutMs = 3500): Promise<TcsAgentHealth | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${agentBase()}/health`, { signal: ctrl.signal });
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

export async function fetchTcsSessionStatus(): Promise<TcsAgentSession | null> {
  try {
    const res = await fetch(`${agentBase()}/session/status`);
    if (!res.ok) return null;
    const body = (await res.json()) as TcsAgentSession & { ok?: boolean };
    return body;
  } catch {
    return null;
  }
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
  opts: { visible?: boolean } = {}
): Promise<TcsWorkspaceBootstrapResponse> {
  return postAgentJson<TcsWorkspaceBootstrapResponse>(
    "/workspace/bootstrap",
    {
      warehouse: "TECS-TCS",
      session_date: sessionDate,
      awbs,
      visible: opts.visible === true,
    },
    "Không khởi tạo được workspace TCS"
  );
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
  payload: import("./buildEsidDeclareFillPayload").EsidDeclareFillPayload
): Promise<TcsEsidDeclareFillResponse> {
  return postAgentJson<TcsEsidDeclareFillResponse>(
    "/esid/declare-fill",
    payload,
    "Điền ESID thất bại"
  );
}

/** HOÀN TẤT form KHAI BÁO đang mở trên agent — bắt buộc confirm_submit. */
export async function declareSubmitTcsEsid(opts: {
  awb: string;
  shipment_id?: string;
  confirm_submit: true;
}): Promise<TcsEsidDeclareSubmitResponse> {
  return postAgentJson<TcsEsidDeclareSubmitResponse>(
    "/esid/declare-submit",
    {
      warehouse: "TECS-TCS",
      awb: opts.awb,
      shipment_id: opts.shipment_id || undefined,
      confirm_submit: true,
    },
    "HOÀN TẤT ESID thất bại"
  );
}

export async function submitTcsPortalJob(payload: TcsPortalJobPayload): Promise<TcsAgentJobResponse> {
  return postAgentJson<TcsAgentJobResponse>("/jobs", payload, "Agent từ chối job");
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
 * Fetch blob rồi gắn download (ổn định hơn mở URL trực tiếp).
 */
export async function downloadPdfFromAgent(pdfNameOrPath: string): Promise<boolean> {
  const name = pdfNameOrPath.replace(/^.*[/\\]/, "");
  if (!name.toLowerCase().endsWith(".pdf")) return false;
  try {
    const res = await fetch(tcsAgentDocUrl(name));
    if (!res.ok) return false;
    const blob = await res.blob();
    if (blob.size < 100) return false;
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    }
    return true;
  } catch {
    return false;
  }
}
