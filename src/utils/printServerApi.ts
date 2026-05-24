import type {
  GenerateScscWeighPdfRequest,
  PrintProfileRecord,
  PrintTemplateFieldRecord,
  PrintTemplateRecord,
} from "../types/printTemplate";

export const DEFAULT_SCSC_PRINT_PROFILE_ID = "prof-scsc-a4-default";
export const DEFAULT_SCSC_TEMPLATE_CODE = "scsc-weigh-a4";

export type PrintJobContext = {
  profile: PrintProfileRecord;
  template: PrintTemplateRecord;
  fields: PrintTemplateFieldRecord[];
};

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    return j.error || j.message || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** Kiểm tra Postgres print API có sẵn (DATABASE_URL + migration). */
export async function probePrintApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`/api/print/job-context?template=${DEFAULT_SCSC_TEMPLATE_CODE}`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPrintJobContext(opts?: {
  profileId?: string;
  templateCode?: string;
}): Promise<PrintJobContext> {
  const q = new URLSearchParams();
  if (opts?.profileId) q.set("profileId", opts.profileId);
  q.set("template", opts?.templateCode ?? DEFAULT_SCSC_TEMPLATE_CODE);
  const res = await fetch(`/api/print/job-context?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<PrintJobContext>;
}

export async function savePrintProfileFields(
  profileId: string,
  fields: ReadonlyArray<Record<string, unknown>>,
  profile?: { offsetXMm?: number; offsetYMm?: number; scaleX?: number; scaleY?: number }
): Promise<void> {
  const res = await fetch(`/api/print/profiles/${encodeURIComponent(profileId)}/fields`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, profile: profile ?? undefined }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

export async function fetchScscWeighPdfBuffer(req: GenerateScscWeighPdfRequest): Promise<ArrayBuffer> {
  const res = await fetch("/api/print/pdf/scsc-weigh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.arrayBuffer();
}
