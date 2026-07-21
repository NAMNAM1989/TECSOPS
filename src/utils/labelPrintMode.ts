const KEY_MODE = "tecsops-label-print-mode";
const KEY_FLIP = "tecsops-label-print-flip-ccw";

/**
 * Cách in trình duyệt theo loại máy:
 *
 * - `xp470b` (mặc định) — Xprinter XP-470B (máy 4″, max 108mm):
 *   trang đúng khổ tem 100×80 / 100×50, không xoay.
 *   TSPL tương đương: SIZE 100 mm,80 mm
 *
 * - `narrow80` — máy cuộn hẹp ~80mm (print head 80mm):
 *   trang 80×100 / 50×100 + xoay tem 90°.
 *
 * Alias legacy localStorage: `direct` → xp470b, `thermal` → narrow80.
 */
export type LabelPrintMode = "xp470b" | "narrow80";

/** @deprecated Dùng LabelPrintMode */
export type LegacyLabelPrintMode = "thermal" | "direct";

function normalizeMode(raw: string | null): LabelPrintMode | null {
  if (raw === "xp470b" || raw === "direct") return "xp470b";
  if (raw === "narrow80" || raw === "thermal") return "narrow80";
  return null;
}

export function loadLabelPrintMode(): LabelPrintMode {
  try {
    return normalizeMode(localStorage.getItem(KEY_MODE)) ?? "xp470b";
  } catch {
    return "xp470b";
  }
}

export function saveLabelPrintMode(m: LabelPrintMode | LegacyLabelPrintMode): void {
  const mode = normalizeMode(m) ?? "xp470b";
  try {
    localStorage.setItem(KEY_MODE, mode);
  } catch {
    /* ignore */
  }
}

/** Đảo chiều xoay 90° (chỉ dùng với narrow80) */
export function loadLabelPrintFlipCcw(): boolean {
  try {
    return localStorage.getItem(KEY_FLIP) === "1";
  } catch {
    return false;
  }
}
