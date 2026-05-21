import {
  normalizeEcargoKhoScscMap,
  type EcargoKhoScscLinePersisted,
  type EcargoKhoScscPersistedMap,
} from "./ecargoKhoScscCore";

export type { EcargoKhoScscLinePersisted, EcargoKhoScscPersistedMap };

const STORAGE_KEY = "TECSOPS_ECARGO_KHO_SCSC_V1";
const MIGRATED_KEY = "TECSOPS_ECARGO_KHO_SCSC_MIGRATED_V2";

/** Đọc bản local cũ (trước khi sync cloud) — chỉ dùng migrate một lần. */
export function loadLegacyEcargoKhoScscLocalState(): EcargoKhoScscPersistedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: EcargoKhoScscPersistedMap = {};
    for (const [id, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id !== "string" || !id.trim()) continue;
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const vehicleInput =
        typeof o.vehicleInput === "string" ? o.vehicleInput.trim().toUpperCase() : "";
      if (!vehicleInput) continue;
      out[id] = { vehicleInput };
    }
    return out;
  } catch {
    return {};
  }
}

export function markEcargoLocalMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, "1");
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isEcargoLocalMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return true;
  }
}

export function mergeEcargoMaps(
  base: EcargoKhoScscPersistedMap,
  overlay: EcargoKhoScscPersistedMap
): EcargoKhoScscPersistedMap {
  return normalizeEcargoKhoScscMap({ ...base, ...overlay });
}
