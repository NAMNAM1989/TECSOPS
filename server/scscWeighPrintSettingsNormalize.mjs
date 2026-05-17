/** Đồng bộ với `src/printing/scscWeigh/scscWeighPrintSettingsCore.ts` */

function clip(s, max) {
  return String(s ?? "").slice(0, max);
}

export function defaultScscWeighPrintSettings() {
  return { senderName: "", senderPhone: "" };
}

export function normalizeScscWeighPrintSettingsLoose(raw) {
  if (!raw || typeof raw !== "object") return defaultScscWeighPrintSettings();
  return {
    senderName: clip(raw.senderName, 60).trim(),
    senderPhone: clip(raw.senderPhone, 24).trim(),
  };
}
