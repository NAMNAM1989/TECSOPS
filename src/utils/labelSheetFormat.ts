const KEY_FORMAT = "tecsops-label-sheet-format";

/** Tem đọc chữ đứng: ngang × cao (mm). XP-470B: trang = tem, không xoay. */
export type LabelSheetFormat = "100x80" | "100x50";

export function labelSheetFormatLabel(f: LabelSheetFormat): string {
  return f === "100x50" ? "100×50 mm" : "100×80 mm";
}

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
