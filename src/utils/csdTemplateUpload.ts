import type { CsdTemplateCatalog, CsdTemplateSlotStatus } from "../types/csdTemplate";

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || res.statusText || `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export function normalizeAwbPrefix(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 3);
  return d.length === 3 ? d.padStart(3, "0") : "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Không đọc được file."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Không đọc được file."));
    reader.readAsDataURL(file);
  });
}

export function buildCsdStatusMap(catalog: CsdTemplateCatalog): Record<string, CsdTemplateSlotStatus> {
  const map: Record<string, CsdTemplateSlotStatus> = {};
  for (const slot of catalog.airlines) {
    map[slot.awbPrefix] = slot.status;
  }
  return map;
}

export async function uploadCsdTemplateBackground(
  awbPrefix: string,
  file: File,
  airlineName?: string
): Promise<{ awbPrefix: string; status: CsdTemplateSlotStatus }> {
  const prefix = normalizeAwbPrefix(awbPrefix);
  if (!prefix) throw new Error("Nhập đủ 3 số AWB trước khi up mẫu CSD.");

  const mime = (file.type || "image/png").toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("Chỉ hỗ trợ PNG, JPG hoặc WEBP (scan form A4).");
  }

  const dataBase64 = await fileToBase64(file);
  const res = await fetch("/api/print/csd/template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      awbPrefix: prefix,
      airlineName: airlineName?.trim() || undefined,
      mimeType: mime,
      fileName: file.name,
      dataBase64,
    }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const j = (await res.json()) as { awbPrefix: string; status: CsdTemplateSlotStatus };
  return { awbPrefix: j.awbPrefix, status: j.status ?? "ready" };
}

export async function deleteCsdTemplateBackground(
  awbPrefix: string
): Promise<{ awbPrefix: string; status: CsdTemplateSlotStatus }> {
  const prefix = normalizeAwbPrefix(awbPrefix);
  if (!prefix) throw new Error("Mã AWB không hợp lệ.");
  const res = await fetch(`/api/print/csd/template/${encodeURIComponent(prefix)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readApiError(res));
  const j = (await res.json()) as { awbPrefix: string; status: CsdTemplateSlotStatus };
  return { awbPrefix: j.awbPrefix, status: j.status ?? "pending" };
}

export { fetchCsdTemplateCatalog } from "./csdPdfPrint";
