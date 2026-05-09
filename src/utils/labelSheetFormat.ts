const KEY_FORMAT = "tecsops-label-sheet-format";
const KEY_COMPACT_HAWB = "tecsops-label-compact-show-hawb";

/** Tem đọc chữ đứng: ngang × cao (mm). */
export type LabelSheetFormat = "100x80" | "100x50";

export function loadLabelSheetFormat(): LabelSheetFormat {
  try {
    const v = localStorage.getItem(KEY_FORMAT);
    if (v === "100x50" || v === "100x80") return v;
  } catch {
    /* ignore */
  }
  return "100x80";
}

export function saveLabelSheetFormat(f: LabelSheetFormat): void {
  try {
    localStorage.setItem(KEY_FORMAT, f);
  } catch {
    /* ignore */
  }
}

/** Chỉ áp dụng khổ 100×50: có in dòng HAWB hay không (mặc định tắt). */
export function loadLabelCompactShowHawb(): boolean {
  try {
    return localStorage.getItem(KEY_COMPACT_HAWB) === "1";
  } catch {
    return false;
  }
}

export function saveLabelCompactShowHawb(on: boolean): void {
  try {
    localStorage.setItem(KEY_COMPACT_HAWB, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
