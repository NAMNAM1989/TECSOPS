/**
 * TSPL (TSC / nhiều máy Xprinter label) — lệnh RAW, không qua driver Chrome.
 */

import {
  THERMAL_LABEL_LAYOUT_100x50 as L50,
  THERMAL_LABEL_LAYOUT_100x80 as L80,
} from "./thermalLabelLayout.mjs";

const DEFAULT_DPI = 203;

export function mmToDots(mm, dpi = DEFAULT_DPI) {
  return Math.round((Number(mm) / 25.4) * dpi);
}

function escTspl(str) {
  return String(str).replace(/"/g, "'");
}

function dot(xmm, ymm, dpi, ox, oy) {
  return `${mmToDots(Number(xmm) + Number(ox), dpi)},${mmToDots(Number(ymm) + Number(oy), dpi)}`;
}

function textCmd(d, slot, text) {
  const t = escTspl(text);
  if (!t) return null;
  const f = slot.font ?? "4";
  const mx = slot.mulX ?? 1;
  const my = slot.mulY ?? 1;
  return `TEXT ${d(slot.x, slot.y)},"${f}",0,${mx},${my},"${t}"`;
}

/**
 * @param {object} p
 */
export function buildTspl(p) {
  const w = p.widthMm ?? 100;
  const h = p.heightMm ?? 80;
  const gap = p.gapMm ?? 2;
  const dpi = p.dpi ?? DEFAULT_DPI;
  const ox = p.offsetXmm ?? 0;
  const oy = p.offsetYmm ?? 0;
  const speed = p.speed ?? 4;
  const density = p.density ?? 8;
  const copies = Math.max(1, Math.min(99, parseInt(String(p.copies ?? 1), 10) || 1));
  const rotation = p.rotation ?? 0;

  const d = (xmm, ymm) => dot(xmm, ymm, dpi, ox, oy);

  const line1 = p.airlineLine1 ?? "";
  const line2 = p.airlineLine2 ?? "";
  const awb = p.awb ?? "";
  const origin = p.origin ?? "SGN";
  const dest = p.dest ?? "";
  const pieces = p.pieces ?? "";
  const hawbNo = p.hawbNo ?? "";
  const hasHawb = Boolean(p.hasHawb && hawbNo.trim());
  const compact = h <= 55;
  const L = L80;
  const digits = (p.awbDigits ?? "").replace(/\D/g, "").slice(0, 11);

  const direction = rotation === 180 || rotation === 270 ? 0 : 1;

  const setup = [
    `SIZE ${w} mm, ${h} mm`,
    `GAP ${gap} mm, 0 mm`,
    `SPEED ${speed}`,
    `DENSITY ${density}`,
    `DIRECTION ${direction}`,
    rotation === 90 || rotation === 270 ? `ROTATION ${rotation === 90 ? 1 : 3}` : null,
    `REFERENCE ${mmToDots(ox, dpi)},${mmToDots(oy, dpi)}`,
    `CLS`,
  ].filter(Boolean);

  const customSlots = Array.isArray(p.thermalSlots) ? p.thermalSlots : null;
  const content = [];
  if (customSlots?.length) {
    for (const slot of customSlots) {
      if (slot.kind === "barcode" && slot.text) {
        const hm = slot.heightMm ?? 8;
        content.push(
          `BARCODE ${d(slot.x, slot.y)},"128",${mmToDots(hm, dpi)},1,0,2,2,"${escTspl(slot.text)}"`
        );
        continue;
      }
      if (slot.kind === "qrcode" && slot.text) {
        const cell = Math.max(2, Math.round((slot.widthMm ?? 20) / 25));
        content.push(`QRCODE ${d(slot.x, slot.y)},M,${cell},A,0,"${escTspl(slot.text)}"`);
        continue;
      }
      if (slot.kind === "box") {
        content.push(
          `BOX ${d(slot.x, slot.y)},${d(slot.x + (slot.widthMm ?? 10), slot.y + (slot.heightMm ?? 10))},2`
        );
        continue;
      }
      if (slot.kind === "bar") {
        content.push(
          `BAR ${d(slot.x, slot.y)},${d(slot.x + (slot.widthMm ?? 1), slot.y + (slot.heightMm ?? 0.35))}`
        );
        continue;
      }
      if (slot.kind === "bitmap" && slot.bitmapHex && slot.widthBytes && slot.heightDots) {
        content.push(
          `BITMAP ${d(slot.x, slot.y)},${slot.widthBytes},${slot.heightDots},0,${slot.bitmapHex}`
        );
        continue;
      }
      const cmd = textCmd(d, slot, slot.text ?? "");
      if (cmd) content.push(cmd);
    }
  } else {
    for (const cmd of [
      textCmd(d, L.airlineLine1, line1),
      textCmd(d, L.airlineLine2, line2),
      textCmd(d, L.mawb, awb),
      textCmd(d, L.originLabel, "Origin"),
      textCmd(d, L.origin, origin),
      textCmd(d, L.destLabel, "Destination"),
      textCmd(d, L.dest, dest),
    ]) {
      if (cmd) content.push(cmd);
    }
  }

  if (!customSlots?.length && compact) {
    if (hasHawb) {
      content.push(textCmd(d, L50.hawbLine, `HAWB  ${hawbNo}`));
    }
    if (hasHawb) {
      content.push(textCmd(d, { ...L50.piecesLabel, y: 44 }, "Pieces · HAWB"));
      if (pieces) content.push(textCmd(d, L50.piecesHawb, pieces));
      content.push(textCmd(d, L50.piecesLabel, "Total · MAWB"));
    } else {
      content.push(textCmd(d, L50.piecesLabel, "Total no. of pieces"));
    }
    if (pieces) content.push(textCmd(d, L50.pieces, pieces));
  } else if (!customSlots?.length) {
    if (hasHawb) {
      content.push(textCmd(d, L.hawbLine, `HAWB  ${hawbNo}`));
    }
    if (hasHawb) {
      for (const cmd of [
        textCmd(d, L.piecesHawbLabel, "Pieces · HAWB"),
        pieces ? textCmd(d, L.piecesHawb, pieces) : null,
        textCmd(d, L.piecesMawbLabel, "Total · MAWB"),
        pieces ? textCmd(d, L.piecesMawb, pieces) : null,
      ]) {
        if (cmd) content.push(cmd);
      }
    } else {
      content.push(textCmd(d, L.piecesLabel, "Total no. of pieces"));
      if (pieces) content.push(textCmd(d, L.pieces, pieces));
    }
  }

  if (!customSlots?.length && !compact && !hasHawb && digits.length >= 8 && L80.barcode) {
    content.push(
      `BARCODE ${d(L80.barcode.x, L80.barcode.y)},"128",${mmToDots(L80.barcode.heightMm, dpi)},1,0,2,2,"${digits}"`
    );
  }

  const parts = [...setup, ...content.filter(Boolean), `PRINT ${copies},1`];
  return parts.join("\r\n") + "\r\n";
}

export function buildTsplCalibration(p) {
  const w = p.widthMm ?? 100;
  const h = p.heightMm ?? 80;
  const gap = p.gapMm ?? 2;
  const dpi = p.dpi ?? DEFAULT_DPI;
  const ox = p.offsetXmm ?? 0;
  const oy = p.offsetYmm ?? 0;
  const name = escTspl(p.profileName ?? "Profile");

  const d = (xmm, ymm) => dot(xmm, ymm, dpi, ox, oy);
  const border = [
    `BOX ${d(0, 0)},${d(w, h)},2`,
    `BAR ${d(w / 2 - 0.5, 0)},${d(w / 2 + 0.5, h)}`,
    `BAR ${d(0, h / 2 - 0.5)},${d(w, h / 2 + 0.5)}`,
    `TEXT ${d(2, 2)},"3",0,1,1,"CAL ${name}"`,
    `TEXT ${d(2, h - 6)},"3",0,1,1,"${w}x${h}mm DPI ${dpi}"`,
    `TEXT ${d(w - 28, h - 6)},"3",0,1,1,"FEED ->"`,
  ];

  const parts = [
    `SIZE ${w} mm, ${h} mm`,
    `GAP ${gap} mm, 0 mm`,
    `DIRECTION 1`,
    `REFERENCE 0,0`,
    `CLS`,
    ...border,
    `PRINT 1,1`,
  ];
  return parts.join("\r\n") + "\r\n";
}
