import { credFetch } from "../apiFetch";

export type AiOpsStatus = {
  ok: boolean;
  configured: boolean;
  model: string;
  eventCount7d: number;
  provider?: string;
  error?: string;
};

export type AiUiFinding = {
  id: string;
  area: string;
  observation: string;
  painPoint: string;
  relatedComponents: string[];
};

export type AiImprovementPriority = {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  evidence: string;
  proposal: string;
  estimatedImpact: string;
  targetFiles?: string[];
  cursorPrompt?: string;
};

export type AiImprovementReportResult = {
  ok: boolean;
  model?: string;
  days?: number;
  depth?: "standard" | "deep";
  generatedAt?: string;
  aggregate?: {
    total: number;
    topActions: { action: string; count: number }[];
    updateFields: { field: string; count: number }[];
  };
  snapshot?: Record<string, unknown>;
  report?: {
    summary: string;
    uiFindings?: AiUiFinding[];
    priorities: AiImprovementPriority[];
    cursorBundlePrompt?: string;
    doNotAutomate: string[];
  };
  error?: string;
  code?: string;
};

/** Fire-and-forget — không chặn UI nếu log fail. */
export function trackAiEvent(
  action: string,
  meta?: Record<string, unknown>,
  source = "ui"
): void {
  const a = String(action || "").trim();
  if (!a) return;
  void fetch("/api/ai/events", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, source, meta: meta ?? {} }),
  }).catch(() => {
    /* ignore */
  });
}

export async function fetchAiStatus(): Promise<AiOpsStatus> {
  const res = await fetch("/api/ai/status", { ...credFetch, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as Partial<AiOpsStatus>;
  if (!res.ok) {
    return {
      ok: false,
      configured: false,
      model: "",
      eventCount7d: 0,
      error: String(data.error || res.statusText),
    };
  }
  return {
    ok: true,
    configured: Boolean(data.configured),
    model: String(data.model || ""),
    eventCount7d: Number(data.eventCount7d) || 0,
    provider: data.provider,
  };
}

export async function requestImprovementReport(
  days = 7,
  depth: "standard" | "deep" = "deep"
): Promise<AiImprovementReportResult> {
  const res = await fetch("/api/ai/improvement-report", {
    ...credFetch,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days, depth }),
  });
  const data = (await res.json().catch(() => ({}))) as AiImprovementReportResult;
  if (!res.ok) {
    return {
      ok: false,
      error: String(data.error || res.statusText || "Tạo báo cáo thất bại"),
      code: data.code,
    };
  }
  return data;
}
