/** Resize + nén ảnh con dấu trước khi lưu (data URL). */

const MAX_EDGE_PX = 480;
const MAX_BYTES = 420_000;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được ảnh con dấu"));
    };
    img.src = url;
  });
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality?: number
): string {
  return canvas.toDataURL(mime, quality);
}

/**
 * Chuyển file ảnh → data URL nhỏ gọn (PNG nếu có alpha, không thì JPEG).
 */
export async function fileToH21SealDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Chỉ nhận ảnh PNG / JPG / WEBP");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn (tối đa 8MB) — chọn file con dấu rõ nét hơn");
  }
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas");
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const preferPng = /png|webp/i.test(file.type);
  let dataUrl = preferPng
    ? canvasToDataUrl(canvas, "image/png")
    : canvasToDataUrl(canvas, "image/jpeg", 0.88);

  if (dataUrl.length > MAX_BYTES) {
    dataUrl = canvasToDataUrl(canvas, "image/jpeg", 0.78);
  }
  if (dataUrl.length > MAX_BYTES) {
    dataUrl = canvasToDataUrl(canvas, "image/jpeg", 0.65);
  }
  if (dataUrl.length > 900_000) {
    throw new Error("Ảnh con dấu vẫn quá lớn sau khi nén — thử ảnh đơn giản hơn");
  }
  return dataUrl;
}

export function parseH21SealDataUrl(dataUrl: string | null | undefined): {
  base64: string;
  extension: "png" | "jpeg" | "webp";
} | null {
  const s = String(dataUrl ?? "").trim();
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const extRaw = m[1]!.toLowerCase();
  const extension = extRaw === "jpg" || extRaw === "jpeg" ? "jpeg" : (extRaw as "png" | "webp");
  return { base64: m[2]!, extension };
}
