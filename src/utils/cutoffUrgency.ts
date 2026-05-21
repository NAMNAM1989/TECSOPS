export type CutoffUrgency = "empty" | "ok" | "warning" | "urgent" | "past";

/** Mức cảnh báo cutoff — dùng cho màu/icon trên lưới desktop. */
export function getCutoffUrgency(iso: string | undefined | null): CutoffUrgency {
  const raw = iso?.trim();
  if (!raw) return "empty";
  const target = new Date(raw).getTime();
  if (Number.isNaN(target)) return "empty";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "past";
  const hours = diffMs / 3_600_000;
  if (hours < 0.5) return "urgent";
  if (hours < 2) return "warning";
  return "ok";
}
