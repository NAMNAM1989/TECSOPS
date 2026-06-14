import type { Shipment } from "../types/shipment";

export type CsdPdfPrintOptions = {
  origin?: string;
  securityStatus?: string;
  screeningMethod?: string;
  issuedByName?: string;
};

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/** Mở/tải PDF CSD IATA cho một lô (GET — không cần Postgres). */
export async function openCsdPdfForShipment(
  shipment: Pick<Shipment, "id" | "awb" | "sessionDate">,
  opts?: CsdPdfPrintOptions
): Promise<void> {
  const q = new URLSearchParams({ id: shipment.id });
  if (opts?.origin) q.set("origin", opts.origin);
  if (opts?.securityStatus) q.set("securityStatus", opts.securityStatus);
  if (opts?.screeningMethod) q.set("screeningMethod", opts.screeningMethod);
  if (opts?.issuedByName) q.set("issuedByName", opts.issuedByName);

  const res = await fetch(`/api/print/pdf/csd?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function fetchCsdPdfBuffer(
  shipment: Pick<Shipment, "id" | "awb" | "sessionDate">,
  opts?: CsdPdfPrintOptions
): Promise<ArrayBuffer> {
  const q = new URLSearchParams({ id: shipment.id });
  if (opts?.origin) q.set("origin", opts.origin);
  if (opts?.securityStatus) q.set("securityStatus", opts.securityStatus);
  if (opts?.screeningMethod) q.set("screeningMethod", opts.screeningMethod);
  if (opts?.issuedByName) q.set("issuedByName", opts.issuedByName);

  const res = await fetch(`/api/print/pdf/csd?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.arrayBuffer();
}
