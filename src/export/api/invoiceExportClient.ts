import type { InvoiceExportFormat, InvoiceExportPayload } from "../contracts/invoiceExportPayload";

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    return j.error || j.message || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** Export invoice từ JSON payload — server render Excel hoặc PDF. */
export async function fetchInvoiceExportBuffer(
  payload: InvoiceExportPayload,
  format: InvoiceExportFormat
): Promise<ArrayBuffer> {
  const res = await fetch("/api/export/invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, payload }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.arrayBuffer();
}
