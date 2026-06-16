import type { Shipment } from "../types/shipment";
import type { CsdTemplateCatalog, CsdTemplateResolve } from "../types/csdTemplate";

export type CsdPdfPrintOptions = {
  origin?: string;
  securityStatus?: string;
  screeningMethod?: string;
  issuedByName?: string;
  /** Bỏ qua mẫu hãng — luôn in mẫu IATA mặc định. */
  forceDefault?: boolean;
};

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export async function fetchCsdTemplateCatalog(): Promise<CsdTemplateCatalog> {
  const res = await fetch("/api/print/csd/catalog", { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as CsdTemplateCatalog;
}

export async function resolveCsdTemplateForAwb(
  awb: string,
  opts?: Pick<CsdPdfPrintOptions, "forceDefault">
): Promise<CsdTemplateResolve> {
  const q = new URLSearchParams({ awb });
  if (opts?.forceDefault) q.set("forceDefault", "1");
  const res = await fetch(`/api/print/csd/resolve?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as CsdTemplateResolve;
}

export function canPrintCsdForm(shipment: Pick<Shipment, "awb">): boolean {
  return String(shipment.awb ?? "").replace(/\D/g, "").length >= 3;
}

/** Mở/tải PDF CSD A4 — tự chọn mẫu theo prefix AWB. */
export async function openCsdPdfForShipment(
  shipment: Pick<Shipment, "id" | "awb" | "sessionDate">,
  opts?: CsdPdfPrintOptions
): Promise<CsdTemplateResolve> {
  const q = new URLSearchParams({ id: shipment.id });
  if (opts?.origin) q.set("origin", opts.origin);
  if (opts?.securityStatus) q.set("securityStatus", opts.securityStatus);
  if (opts?.screeningMethod) q.set("screeningMethod", opts.screeningMethod);
  if (opts?.issuedByName) q.set("issuedByName", opts.issuedByName);
  if (opts?.forceDefault) q.set("forceDefault", "1");

  const resolved = shipment.awb
    ? await resolveCsdTemplateForAwb(shipment.awb, opts)
    : ({
        awbPrefix: null,
        airlineName: null,
        templateDir: "_default",
        templateName: "CSD mặc định",
        templateStatus: "default",
        useCustomTemplate: false,
        paper: "A4",
        page: { width_mm: 210, height_mm: 297 },
      } satisfies CsdTemplateResolve);

  const res = await fetch(`/api/print/pdf/csd?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);

  return resolved;
}

/** In CSD — báo lỗi nếu thiếu AWB hoặc API lỗi. */
export async function printCsdFormForShipment(
  shipment: Pick<Shipment, "id" | "awb" | "sessionDate">,
  opts?: CsdPdfPrintOptions
): Promise<CsdTemplateResolve> {
  if (!canPrintCsdForm(shipment)) {
    throw new Error("Lô chưa có AWB — không in được CSD.");
  }
  return openCsdPdfForShipment(shipment, opts);
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
  if (opts?.forceDefault) q.set("forceDefault", "1");

  const res = await fetch(`/api/print/pdf/csd?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.arrayBuffer();
}

export type CsdPdfPreviewResult = {
  pdfUrl: string;
  revoke: () => void;
  resolved: CsdTemplateResolve;
};

/** Xem trước CSD trong modal (WYSIWYG như AWB Editor) — trả blob URL + metadata mẫu. */
export async function previewCsdFormForShipment(
  shipment: Pick<Shipment, "id" | "awb" | "sessionDate">,
  opts?: CsdPdfPrintOptions
): Promise<CsdPdfPreviewResult> {
  if (!canPrintCsdForm(shipment)) {
    throw new Error("Lô chưa có AWB — không xem trước được CSD.");
  }

  const resolved = shipment.awb
    ? await resolveCsdTemplateForAwb(shipment.awb, opts)
    : ({
        awbPrefix: null,
        airlineName: null,
        templateDir: "_default",
        templateName: "CSD mặc định",
        templateStatus: "default",
        renderMode: "vector",
        useCustomTemplate: false,
        paper: "A4",
        page: { width_mm: 210, height_mm: 297 },
      } satisfies CsdTemplateResolve);

  const buf = await fetchCsdPdfBuffer(shipment, opts);
  const blob = new Blob([buf], { type: "application/pdf" });
  const pdfUrl = URL.createObjectURL(blob);
  const revoke = () => URL.revokeObjectURL(pdfUrl);

  return { pdfUrl, revoke, resolved };
}
