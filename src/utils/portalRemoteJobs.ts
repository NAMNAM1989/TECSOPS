/** Phone độc lập: ĐN / Quét / PDF kho TCS qua hàng đợi Railway + worker máy kho. */

export type PortalJobType = "login" | "scan" | "pdf";

export type PortalWorkerStatus = {
  ok: boolean;
  warehouse: string;
  online: boolean;
  logged_in: boolean;
  message?: string;
  error?: string;
  worker_configured?: boolean;
  updated_at?: string | null;
};

export type PortalJob = {
  id: string;
  warehouse: string;
  type: PortalJobType;
  status: "queued" | "claimed" | "done" | "error" | string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  has_artifact?: boolean;
  artifact_name?: string | null;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchPortalWorkerStatus(
  warehouse: "TCS" | "TECS-TCS" = "TCS"
): Promise<PortalWorkerStatus> {
  try {
    const res = await fetch(
      `/api/portal-worker/status?warehouse=${encodeURIComponent(warehouse)}`,
      { cache: "no-store" }
    );
    const body = (await parseJson(res)) as PortalWorkerStatus;
    if (!res.ok) {
      return {
        ok: false,
        warehouse,
        online: false,
        logged_in: false,
        message: String(body.message || body.error || "Không đọc được worker"),
      };
    }
    return body;
  } catch {
    return {
      ok: false,
      warehouse,
      online: false,
      logged_in: false,
      message: "Không kết nối API portal-worker",
    };
  }
}

export async function createPortalJob(input: {
  warehouse?: "TCS" | "TECS-TCS";
  type: PortalJobType;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; job?: PortalJob; error?: string; message?: string }> {
  try {
    const res = await fetch("/api/portal-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse: input.warehouse || "TCS",
        type: input.type,
        payload: input.payload || {},
      }),
    });
    const body = await parseJson(res);
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: String(body.error || `HTTP_${res.status}`),
        message: String(body.message || body.error || "Tạo job thất bại"),
      };
    }
    return { ok: true, job: body.job as PortalJob };
  } catch (e) {
    return {
      ok: false,
      error: "NETWORK",
      message: e instanceof Error ? e.message : "Tạo job thất bại",
    };
  }
}

export async function getPortalJob(
  id: string
): Promise<{ ok: boolean; job?: PortalJob; error?: string }> {
  const res = await fetch(`/api/portal-jobs/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const body = await parseJson(res);
  if (!res.ok) {
    return { ok: false, error: String(body.error || `HTTP_${res.status}`) };
  }
  return { ok: true, job: body.job as PortalJob };
}

/** Poll đến done/error hoặc timeout. */
export async function waitPortalJob(
  id: string,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (job: PortalJob) => void } = {}
): Promise<PortalJob> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 1200;
  const started = Date.now();
  for (;;) {
    const { ok, job, error } = await getPortalJob(id);
    if (!ok || !job) {
      throw new Error(error || "Job không tồn tại");
    }
    opts.onTick?.(job);
    if (job.status === "done" || job.status === "error") return job;
    if (Date.now() - started > timeoutMs) {
      throw new Error("Hết thời gian chờ máy kho — kiểm tra portal:worker còn chạy?");
    }
    await new Promise((r) => window.setTimeout(r, intervalMs));
  }
}

export async function runPortalJob(input: {
  warehouse?: "TCS" | "TECS-TCS";
  type: PortalJobType;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
  onTick?: (job: PortalJob) => void;
}): Promise<PortalJob> {
  const created = await createPortalJob(input);
  if (!created.ok || !created.job?.id) {
    throw new Error(created.message || created.error || "Không tạo được job");
  }
  return waitPortalJob(created.job.id, {
    timeoutMs: input.timeoutMs,
    onTick: input.onTick,
  });
}

export async function downloadPortalJobArtifact(jobId: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/portal-jobs/${encodeURIComponent(jobId)}/artifact`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) return false;
    const objectUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
    try {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename.replace(/^.*[/\\]/, "") || "ESID.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return true;
    } catch {
      URL.revokeObjectURL(objectUrl);
      return false;
    }
  } catch {
    return false;
  }
}
