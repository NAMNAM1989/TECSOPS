/** Mã hóa ảnh (data URL) thành dữ liệu hex cho lệnh TSPL BITMAP (TSC). */

export type TsplBitmapPayload = {
  widthBytes: number;
  heightDots: number;
  hex: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh"));
    img.src = src;
  });
}

/** Gói pixel 1-bit: MSB trái, mỗi byte 8 pixel ngang. */
export function packMonochromeRows(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { widthBytes: number; hex: string } {
  const widthBytes = Math.ceil(width / 8);
  const bytes: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let bx = 0; bx < widthBytes; bx++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x >= width) continue;
        const i = (y * width + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const on = lum < 200 && data[i + 3] > 32;
        if (on) b |= 0x80 >> bit;
      }
      bytes.push(b);
    }
  }
  const hex = bytes.map((n) => n.toString(16).toUpperCase().padStart(2, "0")).join("");
  return { widthBytes, hex };
}

export async function encodeImageDataUrlToTsplBitmap(
  src: string,
  widthDots: number,
  heightDots: number
): Promise<TsplBitmapPayload | null> {
  if (!src?.trim() || widthDots < 8 || heightDots < 8) return null;
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, widthDots, heightDots);
  ctx.drawImage(img, 0, 0, widthDots, heightDots);
  const imageData = ctx.getImageData(0, 0, widthDots, heightDots);
  const packed = packMonochromeRows(imageData.data, widthDots, heightDots);
  return { widthBytes: packed.widthBytes, heightDots, hex: packed.hex };
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}
