import type { TcsPortalJobPayload } from "./tcsPortalJob";

/** localStorage override — IP/tunnel tùy chỉnh */
export const TCS_AGENT_URL_LS_KEY = "tecsops-tcs-agent-url";

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
  prepared_awb?: string | null;
  preparing_awb?: string | null;
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

/** Đưa cửa sổ Chrome agent lên trước (headed máy kho). */
export async function focusTcsAgentSession(): Promise<{
  ok: boolean;
  headless?: boolean;
  message?: string;
  detail?: string;
  error?: string;
}> {
  const base = agentBase();
  try {
    const res = await fetch(`${base}/session/focus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = (await res.json()) as {
      ok?: boolean;
      headless?: boolean;
      message?: string;
      detail?: string;
      error?: string;
    };
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        headless: body.headless,
        message: body.message || "Không hiện được Chrome",
        error: body.error,
      };
    }
    return { ok: true, ...body };
  } catch {
    return { ok: false, message: agentOfflineHint(base), error: "AGENT_OFFLINE" };
  }
}

export async function openTcsAgentSession(): Promise<{ ok: boolean; message?: string } & TcsAgentSession> {
  try {
    const res = await fetch(`${agentBase()}/session/open`, { method: "POST", body: "{}" });
    const body = (await res.json()) as { ok?: boolean; message?: string } & TcsAgentSession;
    if (!res.ok || body.ok === false || body.open === false) {
      return {
        ...body,
        ok: false,
        message: body.message || "Không mở được Chrome",
        open: body.open ?? false,
        logged_in: body.logged_in ?? false,
      };
    }
    return { ...body, ok: true };
  } catch {
    return {
      ok: false,
      message: agentOfflineHint(),
      open: false,
      logged_in: false,
      url: "",
      awb_locators_confirmed: false,
      needs_login: false,
    };
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
};

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

export async function scanTcsEsidReception(
  awbs: string[],
  sessionDate?: string
): Promise<TcsEsidScanResponse> {
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/esid/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse: "TECS-TCS",
        session_date: sessionDate || undefined,
        awbs,
      }),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
    };
  }
  let body: TcsEsidScanResponse;
  try {
    body = (await res.json()) as TcsEsidScanResponse;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error || `HTTP_${res.status}`,
      message: body.message || "Quét ESID thất bại",
      items: body.items,
      ready: body.ready,
      total: body.total,
      ready_count: body.ready_count,
    };
  }
  return body;
}

export type TcsEsidPrepareResponse = {
  ok: boolean;
  prepared?: boolean;
  awb?: string;
  has_in_button?: boolean;
  elapsed_ms?: number;
  cached?: boolean;
  hot_path?: boolean;
  error?: string;
  message?: string;
};

/** Pre-warm trang chi tiết ESID (nút IN) — gọi khi mở menu ⋮ */
export async function prepareTcsEsid(
  awb: string,
  sessionDate?: string
): Promise<TcsEsidPrepareResponse> {
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/esid/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse: "TECS-TCS",
        awb,
        session_date: sessionDate || undefined,
      }),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
    };
  }
  let body: TcsEsidPrepareResponse;
  try {
    body = (await res.json()) as TcsEsidPrepareResponse;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error || `HTTP_${res.status}`,
      message: body.message || "Prepare ESID thất bại",
      awb: body.awb,
      elapsed_ms: body.elapsed_ms,
    };
  }
  return body;
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
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/esid/declare-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
    };
  }
  let body: TcsEsidDeclareFillResponse;
  try {
    body = (await res.json()) as TcsEsidDeclareFillResponse;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error || `HTTP_${res.status}`,
      message: body.message || "Điền ESID thất bại",
      awb: body.awb,
      warnings: body.warnings,
      elapsed_ms: body.elapsed_ms,
      preview_file: body.preview_file,
      preview_url: body.preview_url,
    };
  }
  return body;
}

/** HOÀN TẤT form KHAI BÁO đang mở trên agent — bắt buộc confirm_submit. */
export async function declareSubmitTcsEsid(opts: {
  awb: string;
  shipment_id?: string;
  confirm_submit: true;
}): Promise<TcsEsidDeclareSubmitResponse> {
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/esid/declare-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse: "TECS-TCS",
        awb: opts.awb,
        shipment_id: opts.shipment_id || undefined,
        confirm_submit: true,
      }),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
      submitted: false,
    };
  }
  let body: TcsEsidDeclareSubmitResponse;
  try {
    body = (await res.json()) as TcsEsidDeclareSubmitResponse;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
      submitted: false,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error || `HTTP_${res.status}`,
      message: body.message || "HOÀN TẤT ESID thất bại",
      awb: body.awb,
      form_awb: body.form_awb,
      warnings: body.warnings,
      submitted: body.submitted ?? false,
      preview_file: body.preview_file,
      elapsed_ms: body.elapsed_ms,
    };
  }
  return body;
}

export async function submitTcsPortalJob(payload: TcsPortalJobPayload): Promise<TcsAgentJobResponse> {
  const base = agentBase();
  let res: Response;
  try {
    res = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: "AGENT_OFFLINE",
      message: agentOfflineHint(base),
    };
  }
  let body: TcsAgentJobResponse;
  try {
    body = (await res.json()) as TcsAgentJobResponse;
  } catch {
    return {
      ok: false,
      error: "BAD_RESPONSE",
      message: `Agent trả về phản hồi không hợp lệ (HTTP ${res.status})`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: body.error || `HTTP_${res.status}`,
      message: body.message || "Agent từ chối job",
    };
  }
  return body;
}

export function getTcsAgentBaseUrl(): string {
  return agentBase();
}

/** URL file trong output/docs (PDF hoặc ảnh preview) qua proxy /tcs-agent. */
export function tcsAgentDocUrl(nameOrPath: string): string {
  const name = nameOrPath.replace(/^.*[/\\]/, "");
  return `${agentBase()}/docs?file=${encodeURIComponent(name)}`;
}

export function tcsAgentPdfUrl(pdfNameOrPath: string): string {
  return tcsAgentDocUrl(pdfNameOrPath);
}

/**
 * Tải PDF ESID về máy (Downloads) — không mở tab xem/in.
 * Fetch blob rồi gắn download (ổn định hơn mở URL trực tiếp).
 */
export async function downloadPdfFromAgent(pdfNameOrPath: string): Promise<boolean> {
  const name = pdfNameOrPath.replace(/^.*[/\\]/, "");
  if (!name.toLowerCase().endsWith(".pdf")) return false;
  try {
    const res = await fetch(tcsAgentPdfUrl(name));
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
