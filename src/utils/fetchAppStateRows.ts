import type { AppState } from "./shipmentMutations";
import { credFetch } from "../apiFetch";
import { parseAppState } from "./appStateParse";
import { debugError, debugWarn } from "./debugLog";

/** Snapshot đầy đủ (lô + danh bạ khách) — dùng khi xuất Excel cần mã khách hàng. */
export async function fetchAppStateSnapshot(): Promise<AppState | null> {
  try {
    const res = await fetch("/api/state", {
      ...credFetch,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      debugWarn("fetch:app-state", "HTTP", res.status);
      return null;
    }
    const raw: unknown = await res.json();
    return parseAppState(raw);
  } catch (e) {
    debugError("fetch:app-state", e);
    return null;
  }
}
