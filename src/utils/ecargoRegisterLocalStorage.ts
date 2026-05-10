import type { EcargoExtensionStatus } from "../types/ecargo";

export type EcargoKhoScscLinePhase = "idle" | "sending" | "sent_local" | "extension";

export type EcargoKhoScscLinePersisted = {
  vehicleInput: string;
  phase: EcargoKhoScscLinePhase;
  extensionStatus?: EcargoExtensionStatus;
  extensionMessage?: string;
};

export type EcargoKhoScscPersistedMap = Record<string, EcargoKhoScscLinePersisted>;

const STORAGE_KEY = "TECSOPS_ECARGO_KHO_SCSC_V1";

function stripSendingForStorage(m: EcargoKhoScscPersistedMap): EcargoKhoScscPersistedMap {
  const out: EcargoKhoScscPersistedMap = {};
  for (const [id, row] of Object.entries(m)) {
    if (row.phase === "sending") {
      out[id] = { ...row, phase: "idle" };
    } else {
      out[id] = row;
    }
  }
  return out;
}

export function loadEcargoKhoScscState(): EcargoKhoScscPersistedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EcargoKhoScscPersistedMap;
  } catch {
    return {};
  }
}

export function saveEcargoKhoScscState(m: EcargoKhoScscPersistedMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stripSendingForStorage(m)));
  } catch {
    /* ignore quota */
  }
}
