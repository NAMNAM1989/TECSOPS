import type { ImageObject, LabelTemplateV1 } from "../core/types";
import { encodeImageDataUrlToTsplBitmap, mmToDots as mmToDotsEncode } from "./tsplBitmapEncode";

export type TsplSlotFromTemplate = {
  key: string;
  text?: string;
  x: number;
  y: number;
  font?: string;
  mulX?: number;
  mulY?: number;
  kind: "text" | "barcode" | "qrcode" | "box" | "bar" | "bitmap";
  heightMm?: number;
  widthMm?: number;
  widthBytes?: number;
  heightDots?: number;
  bitmapHex?: string;
};

const DEFAULT_DPI = 203;

function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function fontMulFromSize(fontSizeMm: number, base = 3): { font: string; mul: number } {
  const mul = Math.max(1, Math.min(4, Math.round(fontSizeMm / base)));
  return { font: mul >= 3 ? "4" : mul >= 2 ? "3" : "2", mul };
}

export function labelTemplateToTsplSlots(template: LabelTemplateV1): TsplSlotFromTemplate[] {
  const slots: TsplSlotFromTemplate[] = [];
  for (const obj of template.objects) {
    switch (obj.type) {
      case "text": {
        if (!obj.text.trim()) continue;
        const { font, mul } = fontMulFromSize(obj.fontSize);
        slots.push({
          key: obj.id,
          kind: "text",
          text: obj.text,
          x: obj.x,
          y: obj.y,
          font,
          mulX: mul,
          mulY: mul,
        });
        break;
      }
      case "barcode": {
        const digits = obj.value.replace(/\D/g, "");
        if (digits.length < 4) continue;
        slots.push({
          key: obj.id,
          kind: "barcode",
          text: digits,
          x: obj.x,
          y: obj.y,
          heightMm: obj.height,
          widthMm: obj.width,
        });
        break;
      }
      case "qr": {
        if (!obj.value.trim()) continue;
        slots.push({
          key: obj.id,
          kind: "qrcode",
          text: obj.value,
          x: obj.x,
          y: obj.y,
          widthMm: obj.width,
        });
        break;
      }
      case "rect": {
        slots.push({
          key: obj.id,
          kind: "box",
          x: obj.x,
          y: obj.y,
          widthMm: obj.width,
          heightMm: obj.height,
        });
        break;
      }
      case "line": {
        slots.push({
          key: obj.id,
          kind: "bar",
          x: obj.x,
          y: obj.y,
          widthMm: Math.abs(obj.x2 - obj.x),
          heightMm: Math.abs(obj.y2 - obj.y) || (obj.strokeWidth ?? 0.35),
        });
        break;
      }
      default:
        break;
    }
  }
  return slots;
}

/** Slots + ảnh BITMAP (async, chỉ trình duyệt). */
export async function labelTemplateToTsplSlotsAsync(
  template: LabelTemplateV1,
  dpi = DEFAULT_DPI
): Promise<TsplSlotFromTemplate[]> {
  const slots = labelTemplateToTsplSlots(template);
  const images = template.objects.filter(
    (o): o is ImageObject => o.type === "image" && Boolean(o.src?.trim())
  );
  if (!images.length || typeof document === "undefined") return slots;

  for (const img of images) {
    const wDots = mmToDotsEncode(img.width, dpi);
    const hDots = mmToDotsEncode(img.height, dpi);
    const payload = await encodeImageDataUrlToTsplBitmap(img.src, wDots, hDots);
    if (!payload) continue;
    slots.push({
      key: img.id,
      kind: "bitmap",
      x: img.x,
      y: img.y,
      widthBytes: payload.widthBytes,
      heightDots: payload.heightDots,
      bitmapHex: payload.hex,
    });
  }
  return slots;
}

/** Ghép chuỗi TSPL từ template (dùng chung logic với server). */
export function buildTsplFromTemplate(
  template: LabelTemplateV1,
  opts: { offsetXmm?: number; offsetYmm?: number; copies?: number } = {}
): string {
  const dpi = template.page.dpi ?? DEFAULT_DPI;
  const ox = opts.offsetXmm ?? 0;
  const oy = opts.offsetYmm ?? 0;
  const w = template.page.width;
  const h = template.page.height;
  const d = (xmm: number, ymm: number) =>
    `${mmToDots(xmm + ox, dpi)},${mmToDots(ymm + oy, dpi)}`;

  const esc = (s: string) => s.replace(/"/g, "'");
  const lines: string[] = [
    `SIZE ${w} mm, ${h} mm`,
    `GAP 2 mm, 0 mm`,
    `DENSITY 8`,
    `SPEED 4`,
    `DIRECTION 1`,
    `REFERENCE ${mmToDots(ox, dpi)},${mmToDots(oy, dpi)}`,
    `CLS`,
  ];

  for (const slot of labelTemplateToTsplSlots(template)) {
    if (slot.kind === "text" && slot.text) {
      const f = slot.font ?? "4";
      const mx = slot.mulX ?? 1;
      const my = slot.mulY ?? 1;
      lines.push(`TEXT ${d(slot.x, slot.y)},"${f}",0,${mx},${my},"${esc(slot.text)}"`);
    } else if (slot.kind === "barcode" && slot.text) {
      const hm = slot.heightMm ?? 8;
      lines.push(
        `BARCODE ${d(slot.x, slot.y)},"128",${mmToDots(hm, dpi)},1,0,2,2,"${esc(slot.text)}"`
      );
    } else if (slot.kind === "qrcode" && slot.text) {
      const cell = Math.max(2, Math.round((slot.widthMm ?? 20) / 25));
      lines.push(`QRCODE ${d(slot.x, slot.y)},M,${cell},A,0,"${esc(slot.text)}"`);
    } else if (slot.kind === "box") {
      lines.push(
        `BOX ${d(slot.x, slot.y)},${d(slot.x + (slot.widthMm ?? 10), slot.y + (slot.heightMm ?? 10))},2`
      );
    } else if (slot.kind === "bar") {
      lines.push(
        `BAR ${d(slot.x, slot.y)},${d(slot.x + (slot.widthMm ?? 1), slot.y + (slot.heightMm ?? 0.35))}`
      );
    } else if (slot.kind === "bitmap" && slot.bitmapHex && slot.widthBytes && slot.heightDots) {
      const xy = d(slot.x, slot.y);
      lines.push(`BITMAP ${xy},${slot.widthBytes},${slot.heightDots},0,${slot.bitmapHex}`);
    }
  }

  lines.push(`PRINT ${opts.copies ?? 1},1`);
  return lines.join("\r\n") + "\r\n";
}
