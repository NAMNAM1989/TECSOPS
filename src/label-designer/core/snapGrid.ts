export function snapMm(value: number, gridMm: number, enabled: boolean): number {
  if (!enabled || gridMm <= 0) return Math.round(value * 2) / 2;
  return Math.round(value / gridMm) * gridMm;
}

export function snapPoint(
  x: number,
  y: number,
  gridMm: number,
  enabled: boolean
): { x: number; y: number } {
  return {
    x: snapMm(x, gridMm, enabled),
    y: snapMm(y, gridMm, enabled),
  };
}
