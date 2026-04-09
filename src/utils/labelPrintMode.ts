const KEY_MODE = "tecsops-label-print-mode";
const KEY_FLIP = "tecsops-label-print-flip-ccw";

/** Máy nhiệt (XP-470B…): trang 80×100 mm + xoay nhãn 90° */
export type LabelPrintMode = "thermal" | "direct";

export function loadLabelPrintMode(): LabelPrintMode {
  try {
    const v = localStorage.getItem(KEY_MODE);
    if (v === "direct" || v === "thermal") return v;
  } catch {
    /* ignore */
  }
  return "thermal";
}

export function saveLabelPrintMode(m: LabelPrintMode): void {
  try {
    localStorage.setItem(KEY_MODE, m);
  } catch {
    /* ignore */
  }
}

/** Đảo chiều xoay 90° (nếu bản in vẫn ngược) */
export function loadLabelPrintFlipCcw(): boolean {
  try {
    return localStorage.getItem(KEY_FLIP) === "1";
  } catch {
    return false;
  }
}

export function saveLabelPrintFlipCcw(on: boolean): void {
  try {
    localStorage.setItem(KEY_FLIP, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
