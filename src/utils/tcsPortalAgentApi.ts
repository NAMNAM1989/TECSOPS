import type { TcsPortalJobPayload } from "./tcsPortalJob";

const DEFAULT_BASE = "http://127.0.0.1:8765";

export type TcsAgentSession = {
  open?: boolean;
  logged_in?: boolean;
  needs_login?: boolean;
  url?: string;
  awb_locators_confirmed?: boolean;
  message?: string;
};

export type TcsAgentHealth = {
  ok: boolean;
  service?: string;
  version?: string;
  warehouse_scope?: string;
  mock?: boolean;
  dry_run?: boolean;
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
    const fromLs = localStorage.getItem("tecsops-tcs-agent-url");
    if (fromLs?.trim()) return fromLs.trim().replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return DEFAULT_BASE;
}

export async function pingTcsAgent(timeoutMs = 2500): Promise<TcsAgentHealth | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${agentBase()}/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as TcsAgentHealth;
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
      message: `Không kết nối agent (${agentBase()}). Chạy: npm run tcs:agent -- --real`,
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
      message: `Không kết nối được agent (${base}). Chạy: npm run tcs:agent:real`,
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
      message: `Không kết nối được agent (${base}). Chạy: npm run tcs:agent:real`,
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
      message: `Không kết nối được agent (${base}). Chạy: npm run tcs:agent hoặc npm run tcs:agent -- --real`,
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

export function tcsAgentPdfUrl(pdfNameOrPath: string): string {
  const name = pdfNameOrPath.replace(/^.*[/\\]/, "");
  return `${agentBase()}/docs?file=${encodeURIComponent(name)}`;
}

export function downloadPdfFromAgent(pdfNameOrPath: string): void {
  const name = pdfNameOrPath.replace(/^.*[/\\]/, "");
  if (!name.toLowerCase().endsWith(".pdf")) return;
  const a = document.createElement("a");
  a.href = tcsAgentPdfUrl(name);
  a.download = name;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}
