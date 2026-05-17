import type { ScscWeighPrintSettings } from "../../types/scscWeighPrintSettings";

const LIMITS = {
  senderName: 60,
  senderPhone: 24,
} as const;

function clip(s: unknown, max: number): string {
  return String(s ?? "").slice(0, max);
}

export function defaultScscWeighPrintSettings(): ScscWeighPrintSettings {
  return { senderName: "", senderPhone: "" };
}

export function clampScscWeighPrintSettings(raw: unknown): ScscWeighPrintSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    senderName: clip(o.senderName, LIMITS.senderName).trim(),
    senderPhone: clip(o.senderPhone, LIMITS.senderPhone).trim(),
  };
}
