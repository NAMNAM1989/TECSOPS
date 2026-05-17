import type { LineObject } from "./types";

export function lineLengthMm(line: LineObject): number {
  return Math.hypot(line.x2 - line.x, line.y2 - line.y);
}

export function lineAngleDeg(line: LineObject): number {
  return (Math.atan2(line.y2 - line.y, line.x2 - line.x) * 180) / Math.PI;
}

/** Đặt chiều dài giữ nguyên điểm đầu (x,y). */
export function setLineLengthFromStart(line: LineObject, lengthMm: number): LineObject {
  const len = Math.max(0.5, lengthMm);
  const cur = lineLengthMm(line) || 1;
  const dx = (line.x2 - line.x) / cur;
  const dy = (line.y2 - line.y) / cur;
  return { ...line, x2: line.x + dx * len, y2: line.y + dy * len };
}

export function setLineAngleFromStart(line: LineObject, angleDeg: number, lengthMm?: number): LineObject {
  const len = lengthMm ?? (lineLengthMm(line) || 10);
  const rad = (angleDeg * Math.PI) / 180;
  return { ...line, x2: line.x + Math.cos(rad) * len, y2: line.y + Math.sin(rad) * len };
}

export function setLineHorizontal(line: LineObject, lengthMm?: number): LineObject {
  const len = lengthMm ?? (lineLengthMm(line) || 50);
  const sign = line.x2 >= line.x ? 1 : -1;
  return { ...line, y2: line.y, x2: line.x + sign * len };
}

export function setLineVertical(line: LineObject, lengthMm?: number): LineObject {
  const len = lengthMm ?? (lineLengthMm(line) || 50);
  const sign = line.y2 >= line.y ? 1 : -1;
  return { ...line, x2: line.x, y2: line.y + sign * len };
}
